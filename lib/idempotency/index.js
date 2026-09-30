
/**
 * @file lib/idempotency/index.js
 *
 * Idempotency key utilities for the funding submission flow.
 *
 * Design rationale
 * ────────────────
 * A double-click or browser/wallet retry must not result in two competing
 * submissions for the same funding intent.  We enforce this at the client
 * layer in two complementary ways:
 *
 * 1. **In-memory guard** (`submissionGuardRef` in `useFundingSubmit`) — blocks
 *    a second call while a request is in-flight within the same React component
 *    instance.
 *
 * 2. **Session-persisted idempotency key** (`getOrCreateIdempotencyKey`) —
 *    the key survives component remounts (e.g. React StrictMode double-invoke,
 *    user clicking a "retry" link).  On retry the same key is re-sent, so if
 *    the server already processed the request it can return the cached result
 *    without double-charging.
 *
 *    `sessionStorage` is deliberately chosen over `localStorage`:
 *    - Cleared automatically when the tab is closed → no stale keys from
 *      previous sessions confusing the server.
 *    - Scoped per tab → a second tab for the same invoice will use its own
 *      key (the BroadcastChannel lock in `useFundingSubmit` handles cross-tab
 *      deduplication separately).
 *
 * Security note
 * ─────────────
 * The key is a random UUID — it carries no sensitive information about the
 * user, wallet, or invoice.  It is only sent as a request header so the
 * backend can deduplicate within the same session.
 *
 * Validation boundaries
 * ────────────────────
 * This module is the single source of truth for what constitutes a valid
 * idempotency key and a valid funding identity triple.  The invariants are:
 *
 * 1. **Non-empty identity** — `invoiceId` must be a non-empty string.
 *    A blank invoice id would collapse all invoices onto one storage key,
 *    causing false deduplication across unrelated invoices.
 * 2. **Valid amount** — `amount` must be a finite, positive number.
 *    `NaN`, `Infinity`, zero, and negative values are rejected because they
 *    either produce undefined string keys or allow an invalid intent to
 *    be persisted.
 * 3. **Wallet normalization** — `null`/`undefined` wallets map to the
 *    `\"anon\"` sentinel.  A non-empty string is trimmed and lowercased so the
 *    same wallet address in different cases shares one key.
 * 4. **Deterministic storage key** — the same valid triple always maps
 *    to the same storage key, and different triples map to different keys.
 * 5. **Invalid input fails closed** — invalid input throws a typed `Error`
 *    rather than silently generating a key that could collide or be reused.
 *
 * 6. **Duplicate submissions** — the same valid triple always maps to the
 *    same storage key, so concurrent or repeated calls share one key.
 *
 * @module lib/idempotency
 */

/** Prefix for all sessionStorage idempotency keys. */
const KEY_PREFIX = "liquifact-idem-";

/** Sentinel wallet value used before connection. */
const ANON_WALLET = "anon";

/** Maximum accepted length for an invoice id. */
const MAX_INVOICE_ID_LENGTH = 256;

/** Maximum accepted length for a wallet address. */
const MAX_WALLET_LENGTH = 256;

/** Maximum accepted funding amount (in the app's base unit). */
const MAX_AMOUNT = Number.MAX_SAFE_INTEGER;

/**
 * Error thrown when an idempotency input fails validation.
 *
 * This is a typed error so callers can distinguish validation failures from
 * storage failures and render appropriate user-visible messages.
 */
export class IdempotencyValidationError extends Error {
  /**
   * @param {string} field   - Which input field failed validation
   * @param {string} message - Human-readable explanation
   */
  constructor(field, message) {
    super(message);
    this.name = "IdempotencyValidationError";
    this.field = field;
  }
}

/**
 * Normalize and validate an invoice identifier.
 *
 * @param {unknown} invoiceId
 * @returns {string} the trimmed invoice id
 * @throws {IdempotencyValidationError}
 */
function normalizeInvoiceId(invoiceId) {
  if (typeof invoiceId !== "string") {
    throw new IdempotencyValidationError(
      "invoiceId",
      "invoiceId must be a non-empty string",
    );
  }
  const trimmed = invoiceId.trim();
  if (trimmed.length === 0) {
    throw new IdempotencyValidationError(
      "invoiceId",
      "invoiceId must be a non-empty string",
    );
  }
  if (trimmed.length > MAX_INVOICE_ID_LENGTH) {
    throw new IdempotencyValidationError(
      "invoiceId",
      `invoiceId must be at most ${MAX_INVOICE_ID_LENGTH} characters`,
    );
  }
  return trimmed;
}

/**
 * Normalize and validate a wallet address.
 *
 * `null` / `undefined` are mapped to the `"anon"` sentinel.  Non-empty
 * strings are trimmed and lowercased.
 *
 * @param {unknown} walletAddress
 * @returns {string}
 * @throws {IdempotencyValidationError}
 */
function normalizeWalletAddress(walletAddress) {
  if (walletAddress == null) return ANON_WALLET;
  if (typeof walletAddress !== "string") {
    throw new IdempotencyValidationError(
      "walletAddress",
      "walletAddress must be a string or null",
    );
  }
  const trimmed = walletAddress.trim();
  if (trimmed.length === 0) return ANON_WALLET;
  if (trimmed.length > MAX_WALLET_LENGTH) {
    throw new IdempotencyValidationError(
      "walletAddress",
      `walletAddress must be at most ${MAX_WALLET_LENGTH} characters`,
    );
  }
  return trimmed.toLowerCase();
}

/**
 * Normalize and validate a funding amount.
 *
 * @param {unknown} amount
 * @returns {number}
 * @throws {IdempotencyValidationError}
 */
function normalizeAmount(amount) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    throw new IdempotencyValidationError(
      "amount",
      "amount must be a finite number",
    );
  }
  if (amount <= 0) {
    throw new IdempotencyValidationError(
      "amount",
      "amount must be greater than zero",
    );
  }
  if (amount > MAX_AMOUNT) {
    throw new IdempotencyValidationError(
      "amount",
      `amount must be at most ${MAX_AMOUNT}`,
    );
  }
  return amount;
}

/**
 * Validate a (walletAddress, invoiceId, amount) triple and return its
 * normalized form.
 *
 * This is the single entry point for validation; all other exports delegate
 * to it so the invariants cannot drift between call sites.
 *
 * @param {string}        invoiceId
 * @param {string|null}  walletAddress
 * @param {number}        amount
 * @returns {{invoiceId: string, walletAddress: string, amount: number}}
 * @throws {IdempotencyValidationError}
 */
export function validateIdempotencyInput(invoiceId, walletAddress, amount) {
  return {
    invoiceId: normalizeInvoiceId(invoiceId),
    walletAddress: normalizeWalletAddress(walletAddress),
    amount: normalizeAmount(amount),
  };
}

/**
 * Build the sessionStorage key for a given (walletAddress, invoiceId, amount)
 * triple.  Amount is included so that two different partial-fund attempts on
 * the same invoice (e.g. $100 then $200) each get an independent idempotency
 * key.
 *
 * @param {string}        invoiceId     - The invoice being funded
 * @param {string | null} walletAddress - Connected wallet address (or null)
 * @param {number}        amount        - Funding amount
 * @returns {string}
 * @throws {IdempotencyValidationError} for invalid input
 */
export function buildStorageKey(invoiceId, walletAddress, amount) {
  const normalized = validateIdempotencyInput(invoiceId, walletAddress, amount);
  return `${KEY_PREFIX}${normalized.walletAddress}-${normalized.invoiceId}-${normalized.amount}`;
}

/**
 * Return the existing idempotency key for this (wallet, invoice, amount)
 * triple from `sessionStorage`, or generate and persist a fresh UUID if none
 * exists yet.
 *
 * Calling this function multiple times with the same arguments is safe —
 * it always returns the same key for the same triple within a browser tab
 * session.
 *
 * @param {string}         invoiceId
 * @param {string | null}  walletAddress
 * @param {number}         amount
 * @returns {string}  A v4 UUID string
 * @throws {IdempotencyValidationError} for invalid input
 */
export function getOrCreateIdempotencyKey(invoiceId, walletAddress, amount) {
  const storageKey = buildStorageKey(invoiceId, walletAddress, amount);

  // Validate before touching storage so invalid input fails closed and
  // never persists a colliding or reusable key.

  // SSR / test environments may not have sessionStorage.
  if (typeof sessionStorage === "undefined") {
    return generateKey();
  }

  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;

  // Duplicate submissions: the first caller to persist wins; later callers
  // read the same key back on the next invocation.

  const fresh = generateKey();
  try {
    sessionStorage.setItem(storageKey, fresh);
  } catch {
    // sessionStorage full or blocked (e.g. private-browsing quota exceeded).
    // Fall back to a fresh key that won't be persisted — the in-memory guard
    // still prevents double-submit within the same React lifecycle.
  }
  return fresh;
}

/** @internal exported for tests only */
export { generateKey as __generateKeyForTests };

/**
 * Generate a fresh idempotency key.
 *
 * Prefers `crypto.randomUUID()` when available.  Falls back to a
 * `crypto.getRandomValues`-based v4 UUID, and finally to a
 * timestamp+random composite for environments with no Web Crypto at all.
 * This keeps key generation deterministic in shape (always a non-empty
 * string) and never throws, so a missing crypto API cannot turn a
 * user-visible funding action into an unhandled exception.
 *
 * @returns {string}
 */
function generateKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Remove the persisted idempotency key for this triple.
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
 * @throws {IdempotencyValidationError} for invalid input
 */
export function clearIdempotencyKey(invoiceId, walletAddress, amount) {
  const storageKey = buildStorageKey(invoiceId, walletAddress, amount);
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    // Ignore — key was never stored or storage is unavailable.
  }
}
