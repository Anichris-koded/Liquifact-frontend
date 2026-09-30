/**
 * @file lib/idempotency/index.js
 *
 * Idempotency key utilities for the funding submission flow.
 *
 * Design rationale
 * ────────────────
 * A double-click or browser/wallet retry must not result in two competing
 * submissions for the same funding intent.  We enforce this at the client
 * layer in three complementary ways:
 *
 * 1. **Cross-tab exclusive lock** (`withExclusiveTabLock` in
 *    `lib/concurrency/tabLock.js`) — only one tab can be inside a funding
 *    submission for a given invoice at a time.
 *
 * 2. **In-memory guard** (`submissionGuardRef` in `useFundingSubmit`) — blocks
 *    a second call while a request is in-flight within the same React component
 *    instance.
 *
 * 3. **Session-persisted idempotency key** (`getOrCreateIdempotencyKey`) —
 *    the key survives component remounts (e.g. React StrictMode double-invoke,
 *    user clicking a "retry" link).  On retry the same key is re-sent, so if
 *    the server already processed the request it can return the cached result
 *    without double-charging.
 *
 *    `sessionStorage` is deliberately chosen over `localStorage`:
 *    - Cleared automatically when the tab is closed → no stale keys from
 *      previous sessions confusing the server.
 *    - Scoped per tab → a second tab for the same invoice will use its own
 *      key (the cross-tab lock in `useFundingSubmit` handles cross-tab
 *      deduplication separately).
 *
 * ── Determinism invariant ─────────────────────────────────────────────────────
 * For a given `(walletAddress, invoiceId, amount)` triple, repeated calls in the
 * same JS context MUST return the same key — including when `sessionStorage` is
 * unavailable (SSR / sandboxed iframe) or throws (`QuotaExceededError`,
 * Safari private mode). A retry that silently got a *new* key would defeat
 * server-side deduplication and could double-charge. We therefore keep a
 * module-scoped `Map` as the authoritative fallback: a key is only ever
 * generated when no cached key exists in either tier.
 *
 * Security note
 * ─────────────
 * The key is a random UUID — it carries no sensitive information about the
 * user, wallet, or invoice.  It is only sent as a request header so the
 * backend can deduplicate within the same session.
 *
 * @module lib/idempotency
 */

/** Prefix for all sessionStorage idempotency keys. */
const KEY_PREFIX = "liquifact-idem-";

/**
 * In-memory idempotency keys, keyed by the same storage key as sessionStorage.
 *
 * This tier exists for two reasons:
 * 1. `sessionStorage` may be absent (SSR, sandboxed iframe) — we must still
 *    return a stable key for the lifetime of the module.
 * 2. `sessionStorage.setItem` may throw (quota / private mode). Falling back to
 *    a freshly generated UUID on every call would make retries non-idempotent,
 *    so the key is cached here instead.
 *
 * @type {Map<string, string>}
 */
const inMemoryKeys = new Map();

/**
 * Encode one segment of a storage key so that the `-` delimiter can never
 * appear inside a segment.
 *
 * Without this, two distinct triples collide — e.g. wallet `"x"` / invoice
 * `"y-z"` and wallet `"x-y"` / invoice `"z"` both produce `x-y-z-1`. A collision
 * makes two separate funding intents share one idempotency key, so the server
 * treats the second as a replay and silently drops it.
 *
 * `encodeURIComponent` leaves `-` untouched, so we escape it explicitly (and it
 * already escapes `%`, keeping the encoding unambiguous and reversible).
 *
 * @param {string | number} value
 * @returns {string}
 */
function encodeSegment(value) {
  return encodeURIComponent(String(value)).replace(/-/g, "%2D");
}

/**
 * Build the storage key for a given (walletAddress, invoiceId, amount) triple.
 * Amount is included so that two different partial-fund attempts on the same
 * invoice (e.g. $100 then $200) each get an independent idempotency key.
 *
 * @param {string}         invoiceId     - The invoice being funded
 * @param {string | null}  walletAddress - Connected wallet address (or null)
 * @param {number}         amount        - Funding amount
 * @returns {string}
 */
export function buildStorageKey(invoiceId, walletAddress, amount) {
  // walletAddress may be absent before connection; treat null / undefined as
  // "anonymous" so a key is always generated and can be stored before the
  // wallet is fully connected.
  const wallet = walletAddress ?? "anon";
  return (
    `${KEY_PREFIX}${encodeSegment(wallet)}-` +
    `${encodeSegment(invoiceId)}-${encodeSegment(amount)}`
  );
}

/**
 * Return the existing idempotency key for this (wallet, invoice, amount)
 * triple, or generate and cache a fresh UUID if none exists yet.
 *
 * Lookup order is sessionStorage first (survives a page reload within the
 * session), then the in-memory map.  A key found in sessionStorage is also
 * seeded into the in-memory map so later reads keep working even if storage
 * later becomes unavailable or throws.
 *
 * Calling this function multiple times with the same arguments is safe — it
 * always returns the same key for the same triple within a browser tab session.
 *
 * @param {string}         invoiceId
 * @param {string | null}  walletAddress
 * @param {number}         amount
 * @returns {string}  A v4 UUID string
 */
/**
 * Best-effort persistence to `sessionStorage`. Never throws — storage may be
 * absent, full, or blocked.
 *
 * @param {string} storageKey
 * @param {string} value
 */
function persistKey(storageKey, value) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(storageKey, value);
  } catch {
    // sessionStorage full or blocked (e.g. private-browsing quota exceeded).
    // The in-memory cache guarantees retries still reuse this key.
  }
}

/**
 * Return the existing idempotency key for this (wallet, invoice, amount)
 * triple, or generate and cache a fresh UUID if none exists yet.
 *
 * Lookup order is sessionStorage first (survives a page reload within the
 * session), then the in-memory map.  A key served from the in-memory tier is
 * re-persisted when possible, so the storage tier self-heals after clearing.
 *
 * Calling this function multiple times with the same arguments is safe — it
 * always returns the same key for the same triple within a browser tab session.
 *
 * @param {string}         invoiceId
 * @param {string | null}  walletAddress
 * @param {number}         amount
 * @returns {string}  A v4 UUID string
 */
export function getOrCreateIdempotencyKey(invoiceId, walletAddress, amount) {
  const storageKey = buildStorageKey(invoiceId, walletAddress, amount);

  // Tier 1: sessionStorage (SSR / test environments may not have it).
  if (typeof sessionStorage !== "undefined") {
    let existing = null;
    try {
      existing = sessionStorage.getItem(storageKey);
    } catch {
      // Reading can throw in locked-down contexts — fall through to memory.
    }
    if (existing) {
      inMemoryKeys.set(storageKey, existing);
      return existing;
    }
  }

  // Tier 2: in-memory cache. Re-seed storage so a cleared sessionStorage does
  // not lose the key mid-flight.
  const cached = inMemoryKeys.get(storageKey);
  if (cached) {
    persistKey(storageKey, cached);
    return cached;
  }

  const fresh = crypto.randomUUID();
  // Cache before persisting so a storage failure still leaves a stable key.
  inMemoryKeys.set(storageKey, fresh);
  persistKey(storageKey, fresh);
  return fresh;
}

/**
 * Remove the persisted idempotency key for this triple, from both tiers.
 *
 * Call this on confirmed SUCCESS so that a fresh invoice funding attempt
 * (same invoice, same amount) in a later session gets a new key rather than
 * re-using a key the server already marked as processed.
 *
 * On FAILURE / ROLLBACK the key is intentionally kept so that a user retry
 * re-uses the same key and the server can return a cached idempotent response
 * if it already partially processed the request.
 *
 * @param {string}         invoiceId
 * @param {string | null}  walletAddress
 * @param {number}         amount
 */
export function clearIdempotencyKey(invoiceId, walletAddress, amount) {
  const storageKey = buildStorageKey(invoiceId, walletAddress, amount);
  inMemoryKeys.delete(storageKey);
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    // Ignore — key was never stored or storage is unavailable.
  }
}

/**
 * Test-only hook: drop all in-memory keys so suites can assert from a clean
 * slate. Not part of the public API and unused by application code.
 *
 * @internal
 */
export function __resetIdempotencyCacheForTests() {
  inMemoryKeys.clear();
}
