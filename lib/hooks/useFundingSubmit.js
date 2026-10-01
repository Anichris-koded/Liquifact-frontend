

/**
 * @file lib/hooks/useFundingSubmit.js
 *
 * React hook that owns the complete lifecycle of a single funding submission.
 *
 * ── What this hook does ───────────────────────────────────────────────────────
 *
 * 1. **Cross-tab exclusive lock** — `withExclusiveTabLock` takes the Web Locks
 *    API lock `liquifact-fund-lock-<invoiceId>` (`ifAvailable: true`) before the
 *    request is issued, so two tabs can never both submit for the same invoice.
 *    A tab that loses the race is surfaced as `blocked_by_tab` and never calls
 *    `performFund`.  When Web Locks is unavailable we degrade to an advisory
 *    `BroadcastChannel` protocol (below) plus the server-side idempotency key.
 *
 * 2. **Double-submit guard** — an in-memory ref (`submissionGuardRef`) ensures
 *    that re-activating the action while a request is in-flight is a no-op,
 *    even if the button becomes briefly clickable before React re-renders with
 *    the disabled attribute. The ref is set *synchronously* before the first
 *    `await`, so two calls in the same tick cannot both pass it.
 *
 * 3. **Idempotency key** — `getOrCreateIdempotencyKey` returns a stable UUID
 *    stored in `sessionStorage` for the (wallet, invoiceId, amount) triple.
 *    The same key is re-used on retry so the server can detect and respond to
 *    a replay without double-charging.  The key is cleared on confirmed success
 *    so a future legitimate re-fund gets a fresh key.
 *
 * 4. **Advisory BroadcastChannel lock** — kept for browsers without Web Locks
 *    and as a UI signal.  Ownership rules:
 *      - a tab that is itself mid-submission ignores peer `FUND_LOCK` messages
 *        (it must not be downgraded to `blocked_by_tab` by a racing peer);
 *      - a `FUND_UNLOCK` only releases the tab it is addressed to (matched by
 *        owner token), so a stale unlock cannot clear an active newer lock;
 *      - only the tab that actually holds the lock broadcasts `FUND_UNLOCK`
 *        (including on unmount) — an idle tab must never release a peer's lock.
 *
 * 5. **Abort on unmount** — an `AbortController` tied to the current request is
 *    cancelled on component unmount, preventing stale-state updates.
 *
 * 6. **Explicit state machine** — the hook exposes one of five states:
 *    `idle | pending | success | failure | blocked_by_tab`.
 *    Each state is rendered as a distinct UI in `FundActions`.
 *
 * ── State machine ─────────────────────────────────────────────────────────────
 *
 *   idle ──[submit]──────────────────────▶ pending ──[resolved]──▶ success
 *     ▲                                       │
 *     │                              [rejected / timeout]
 *     │                                       │
 *     └──[retry after failure] ◀── failure ◀──┘
 *
 *   idle ──[tab-lock received]──▶ blocked_by_tab ──[tab-unlock received]──▶ idle
 *
 * ── Invariants ────────────────────────────────────────────────────────────────
 *
 * I1. A submission is only ever started from IDLE or FAILURE (never from
 *     PENDING, SUCCESS, or BLOCKED_BY_TAB).
 * I2. `submissionGuardRef` is true iff a request is in-flight; it is always
 *     released in `finally` so a thrown/rejected call cannot wedge the hook.
 * I3. The idempotency key is stable across retries of the same
 *     (invoiceId, walletAddress, amount) triple and cleared only on confirmed
 *     success, so a retry after failure replays the same key.
 * I4. The cross-tab lock is released (FUND_UNLOCK) exactly once per acquired
 *     lock, including on unmount and on abort.
 * I5. State updates from an aborted/stale request are ignored.
 *
 * ── Public API ────────────────────────────────────────────────────────────────
 * const {
 *   fundingState,      // "idle" | "pending" | "success" | "failure" | "blocked_by_tab"
 *   isPending,         // boolean
 *   isBlocked,         // boolean — another tab already has a lock
 *   idempotencyKey,    // string | null — the key sent with the current/last request
 *   submit,            // (amount: number) => Promise<void>
 *   reset,             // () => void — clear failure state to re-enable form
 * } = useFundingSubmit({ invoiceId, walletAddress, performFund, onSuccess, onError });
 *
 * @module lib/hooks/useFundingSubmit
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getOrCreateIdempotencyKey, clearIdempotencyKey } from "@/lib/idempotency";
import { withExclusiveTabLock, supportsWebLocks } from "@/lib/concurrency/tabLock";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Stable state labels — consumers should import and compare against these. */
export const FUNDING_SUBMIT_STATES = {
  IDLE: "idle",
  PENDING: "pending",
  SUCCESS: "success",
  FAILURE: "failure",
  /** Another tab for the same invoice has already acquired the in-flight lock. */
  BLOCKED_BY_TAB: "blocked_by_tab",
};

/**
 * BroadcastChannel name template for a given invoice.
 * Each invoice gets its own channel so unrelated invoices do not interfere.
 *
 * @param {string} invoiceId
 * @returns {string}
 */
function channelName(invoiceId) {
  return `liquifact-fund-${invoiceId}`;
}

/**
 * Generate an opaque per-instance owner token used to scope advisory lock
 * messages. A tab may only release a lock whose owner token it recognises.
 *
 * @returns {string}
 */
function newOwnerToken() {
  try {
    return crypto.randomUUID();
  } catch {
    return `owner-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Manages the complete lifecycle of a funding submission for a single invoice.
 *
 * @param {object}         options
 * @param {string}         options.invoiceId      - Invoice being funded
 * @param {string | null}  [options.walletAddress] - Connected wallet address
 * @param {Function}       options.performFund    - Async fn: (invoiceId, amount, idempotencyKey, signal) => Promise<any>
 * @param {Function}       [options.onSuccess]    - Called with result on success
 * @param {Function}       [options.onError]      - Called with error on failure
 *
 * @returns {{
 *   fundingState: string,
 *   isPending: boolean,
 *   isSuccess: boolean,
 *   isBlocked: boolean,
 *   idempotencyKey: string | null,
 *   submit: (amount: number) => Promise<void>,
 *   reset: () => void,
 * }}
 */
export function useFundingSubmit({
  invoiceId,
  walletAddress = null,
  performFund,
  onSuccess,
  onError,
} = {}) {
  // Validate required inputs up-front so callers fail fast and deterministically.
  if (typeof invoiceId !== "string" || invoiceId.length === 0) {
    throw new Error("useFundingSubmit: `invoiceId` is required");
  }
  if (typeof performFund !== "function") {
    throw new Error("useFundingSubmit: `performFund` must be a function");
  }

  const [fundingState, setFundingState] = useState(FUNDING_SUBMIT_STATES.IDLE);
  const [currentKey, setCurrentKey] = useState(null);

  // ── Refs ──────────────────────────────────────────────────────────────────

  /**
   * In-memory double-submit guard.
   * True while a request is in-flight — blocks re-entrant calls even before
   * React re-renders the disabled button. Set synchronously before any await.
   */
  const submissionGuardRef = useRef(false);

  /** AbortController for the active request. Replaced per attempt. */
  const abortRef = useRef(null);

  /** BroadcastChannel for cross-tab coordination (may be null if unavailable). */
  const channelRef = useRef(null);

  /** Whether a peer tab currently holds the advisory lock (advisory fallback). */
  const tabBlockedRef = useRef(false);

  /**
   * Whether *this* instance currently holds the advisory lock. Only the holder
   * may broadcast `FUND_UNLOCK` (releasing a lock we never took would let a
   * non-participating tab unlock a real in-flight submission in another tab).
   */
  const lockHeldRef = useRef(false);

  /** Stable per-instance owner token used to scope advisory lock messages. */
  const ownerRef = useRef(null);
  if (ownerRef.current === null) ownerRef.current = newOwnerToken();

  /** Owner token of the peer lock we are currently blocked on, if any. */
  const peerLockOwnerRef = useRef(null);

  // ── BroadcastChannel setup (advisory fallback) ────────────────────────────

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined" || !invoiceId) return;

    let channel;
    try {
      channel = new BroadcastChannel(channelName(invoiceId));
    } catch {
      // BroadcastChannel may throw in some restricted environments.
      return;
    }

    channelRef.current = channel;

    channel.onmessage = (event) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;

      if (data.type === "FUND_LOCK") {
        // A peer just started a submission.
        // If we are ourselves mid-submission we already hold the lock and must
        // NOT be downgraded/blocked by a racing peer — otherwise both tabs end
        // up disabled while both requests are already in flight.
        if (submissionGuardRef.current || lockHeldRef.current) return;
        // Preserve the first lock we observed; a later lock from a different
        // owner must not silently take over the one we are waiting on.
        if (peerLockOwnerRef.current !== null) return;
        peerLockOwnerRef.current = data.owner ?? null;
        tabBlockedRef.current = true;
        setFundingState(FUNDING_SUBMIT_STATES.BLOCKED_BY_TAB);
      } else if (data.type === "FUND_UNLOCK") {
        // Only the owner of the lock we are blocked on may release us. This
        // ignores stale unlocks from a previous submission to the same channel.
        if (data.owner && data.owner !== peerLockOwnerRef.current) return;
        if (submissionGuardRef.current || lockHeldRef.current) return;
        peerLockOwnerRef.current = null;
        tabBlockedRef.current = false;
        setFundingState((prev) =>
          prev === FUNDING_SUBMIT_STATES.BLOCKED_BY_TAB ? FUNDING_SUBMIT_STATES.IDLE : prev
        );
      }
    };

    return () => {
      // Send FUND_UNLOCK BEFORE closing the channel so other tabs receive the
      // message. If we close first, postMessage would be a no-op. Only the tab
      // that actually holds the lock may release it.
      if (lockHeldRef.current) {
        lockHeldRef.current = false;
        channel.postMessage({
          type: "FUND_UNLOCK",
          invoiceId,
          owner: ownerRef.current,
        });
      }
      channel.close();
      channelRef.current = null;
      // A tab that goes away must not leave us permanently blocked.
      tabBlockedRef.current = false;
    };
  }, [invoiceId]);

  // ── Abort on unmount ──────────────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      // channelRef cleanup (including FUND_UNLOCK broadcast) is handled in the
      // BroadcastChannel effect above to guarantee ordering: unlock before close.
      // Reset the guard so a remount of the same hook instance is usable
      // (invariant I2).
      submissionGuardRef.current = false;
      // Invalidate any in-flight attempt so late resolutions cannot mutate state.
      attemptTokenRef.current += 1;
    };
  }, []);

  // ── submit ────────────────────────────────────────────────────────────────

  /**
   * Initiate the funding submission.
   *
   * @param {number} amount - Validated positive funding amount
   */
  const submit = useCallback(
    async (amount) => {
      // ── Guards ────────────────────────────────────────────────────────────

      // Validate amount deterministically (boundary + type).
      if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
        throw new Error("useFundingSubmit: `amount` must be a positive finite number");
      }

      // Prevent re-entrant call (double-click within the same React lifecycle).
      // Runs synchronously before any await, so two calls in the same tick
      // cannot both pass.
      if (submissionGuardRef.current) return;

      // Block if another tab already has the advisory lock for this invoice.
      if (tabBlockedRef.current) return;

      // Enforce I1: refuse to start from a non-startable state. This is a
      // defense-in-depth check; the guard ref above already covers the
      // in-flight case, but this also protects against SUCCESS re-entry.
      if (NON_STARTABLE_STATES.has(fundingState)) return;

      // ── Acquire in-memory lock ────────────────────────────────────────────
      submissionGuardRef.current = true;

      // Capture a fresh attempt token. Any resolution whose token no longer
      // matches the current ref value is stale (aborted, superseded, unmounted).
      attemptTokenRef.current += 1;
      const attemptToken = attemptTokenRef.current;

      // ── Idempotency key ───────────────────────────────────────────────────
      const idem = getOrCreateIdempotencyKey(invoiceId, walletAddress, amount);
      if (!idem) {
        // If key generation failed, do not proceed — refuse to submit without
        // a stable idempotency key (invariant I3).
        submissionGuardRef.current = false;
        throw new Error("useFundingSubmit: failed to obtain idempotency key");
      }
      setCurrentKey(idem);

      // Fresh AbortController per attempt.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      /** Release every lock this attempt owns, exactly once. */
      const releaseLock = () => {
        if (lockHeldRef.current) {
          lockHeldRef.current = false;
          channelRef.current?.postMessage({
            type: "FUND_UNLOCK",
            invoiceId,
            owner: ownerRef.current,
          });
        }
        submissionGuardRef.current = false;
      };

      /**
       * The actual request. Runs only once we hold the exclusive lock (or once
       * we have confirmed Web Locks is unavailable).
       */
      const runSubmission = async () => {
        // Advertise the advisory lock so non-Web-Locks peers render the
        // blocked-by-tab state. Setting state happens synchronously on the
        // first invocation so the UI reacts in the same tick as the click.
        lockHeldRef.current = true;
        channelRef.current?.postMessage({
          type: "FUND_LOCK",
          invoiceId,
          owner: ownerRef.current,
        });
        setFundingState(FUNDING_SUBMIT_STATES.PENDING);

        try {
          const result = await performFund(invoiceId, amount, idem, controller.signal);

          // Ignore if we were aborted (component unmounted mid-flight).
          if (controller.signal.aborted) return;

          // ── Success ─────────────────────────────────────────────────────
          // Clear the persisted key so a future re-funding attempt gets fresh.
          clearIdempotencyKey(invoiceId, walletAddress, amount);
          setCurrentKey(null);
          setFundingState(FUNDING_SUBMIT_STATES.SUCCESS);
          onSuccess?.(result);
        } catch (err) {
          // Ignore AbortErrors triggered by unmount.
          if (err?.name === "AbortError" && controller.signal.aborted) return;

          // ── Failure ─────────────────────────────────────────────────────
          // Keep the idempotency key in storage so a retry re-uses it.
          setFundingState(FUNDING_SUBMIT_STATES.FAILURE);
          onError?.(err);
          // Re-throw so callers can classify the error for user-facing messages
          // (e.g. different copy for timeout vs wallet-reject vs 409 conflict).
          throw err;
        } finally {
          // Release locks whether success, failure, or abort.
          releaseLock();
        }
      };

      // ── No Web Locks: advisory path ───────────────────────────────────────
      // Publish the lock and enter `pending` synchronously so peers react in
      // the same tick (legacy behaviour, preserved for older browsers).
      if (!supportsWebLocks()) {
        await runSubmission();
        return;
      }

      // ── Web Locks: true cross-tab exclusion ───────────────────────────────
      let acquired = false;
      try {
        await withExclusiveTabLock(invoiceId, async () => {
          acquired = true;
          await runSubmission();
        });
      } catch (err) {
        // runSubmission already recorded the failure and released the lock;
        // make sure the guard cannot be left latched, then propagate so callers
        // can classify the error.
        releaseLock();
        throw err;
      }

      if (!acquired) {
        // Another tab holds the exclusive lock. We have not issued a request.
        if (lockHeldRef.current) {
          lockHeldRef.current = false;
          channelRef.current?.postMessage({
            type: "FUND_UNLOCK",
            invoiceId,
            owner: ownerRef.current,
          });
        }
        submissionGuardRef.current = false;
        abortRef.current = null;
        setFundingState(FUNDING_SUBMIT_STATES.BLOCKED_BY_TAB);
      }
    },
    [invoiceId, walletAddress, performFund, onSuccess, onError, fundingState]
  );

  // ── reset ─────────────────────────────────────────────────────────────────

  /**
   * Clear a failure state so the user can retry without refreshing the page.
   * Does nothing when not in a failure state.
   */
  const reset = useCallback(() => {
    setFundingState((prev) =>
      prev === FUNDING_SUBMIT_STATES.FAILURE || prev === FUNDING_SUBMIT_STATES.SUCCESS
        ? FUNDING_SUBMIT_STATES.IDLE
        : prev
    );
  }, []);

  // ── Return ────────────────────────────────────────────────────────────────

  return {
    fundingState,
    isPending: fundingState === FUNDING_SUBMIT_STATES.PENDING,
    isSuccess: fundingState === FUNDING_SUBMIT_STATES.SUCCESS,
    isSuccess: fundingState === FUNDING_SUBMIT_STATES.SUCCESS,
    isFailure: fundingState === FUNDING_SUBMIT_STATES.FAILURE,
    isBlocked: fundingState === FUNDING_SUBMIT_STATES.BLOCKED_BY_TAB,
    idempotencyKey: currentKey,
    submit,
    reset,
  };
}
