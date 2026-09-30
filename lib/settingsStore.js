/** localStorage key where user settings are persisted. */
export const SETTINGS_STORAGE_KEY = "liquifact-settings";

/** localStorage key where the last-changed timestamp (ms epoch) is persisted. */
export const SETTINGS_UPDATED_KEY = "liquifact-settings-updated";

/** Allowed currency codes. Frozen to prevent accidental mutation. */
export const ALLOWED_CURRENCIES = Object.freeze(["USD", "EUR", "NGN"]);

/** Currency code type derived from the allow-list. */
/** @typedef {"USD"|"EUR","NGN"} Currency */

/** @jsonew {{currency: Currency, emailNotifications: boolean}} */
export const DEFAULT_SETTINGS = Object.freeze({
  currency: "USD",
  emailNotifications: true,
});

/**
 * Result of a validation attempt.
 *
 * @typedef {ok: true, value: {currency: Currency, emailNotifications: boolean}} ValidationOk
 * @typedef {ok: false, error: string, field?: string} ValidationError
 * @typedef {ValidationOk|ValidationError} ValidationResult
 */

/**
 * Normalize a single currency value into a canonical allow-listed code.
 * Accepts any case and trims surrounding whitespace. Returns null for
 * anything that is not a string or not in the allow-list.
 *
 * @param {unknown} value
 * @returns {Currency|null}
 */
export function normalizeCurrency(value) {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  return ALLOWED_CURRENCIES.includes(upper) ? upper : null;
}

/**
 * Validate an arbitrary settings object against the canonical shape.
 *
 * Invariants:
 *   - `currency` must be a string in the allow-list (case-insensitive)
 *   - `emailNotifications` must be a boolean
 *   - unknown keys are stripped (no prototype pollution, no silent carry-over)
 *
 * @param {unknown} input
 * @returns {ValidationResult}
 */
export function validateSettings(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "settings must be an object" };
  }

  const currency = normalizeCurrency(input.currency);
  if (currency === null) {
    return {
      ok: false,
      error: `currency must be one of ${ALLOWED_CURRENCIES.join(", ")}`,
      field: "currency",
    };
  }

  if (typeof input.emailNotifications !== "boolean") {
    return {
      ok: false,
      error: "emailNotifications must be a boolean",
      field: "emailNotifications",
    };
  }

  return {
    ok: true,
    value: {
      currency,
      emailNotifications: input.emailNotifications,
    },
  };
}

/**
 * Read persisted settings from localStorage, merged over the defaults so
 * missing/older keys don't break the UI. Safe to call from the browser only.
 *
 * Any persisted value that fails validation falls back to the defaults for
 * the invalid field, so a corrupted or tampered storage entry cannot propagate
 * an unsafe value into the app.
 *
 * @returns {typeof DEFAULT_SETTINGS}
 */
export function readStoredSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ...DEFAULT_SETTINGS };
    }

    const currency = normalizeCurrency(parsed.currency);
    const emailNotifications =
      typeof parsed.emailNotifications === "boolean"
        ? parsed.emailNotifications
        : DEFAULT_SETTINGS.emailNotifications;

    return {
      currency: currency ?? DEFAULT_SETTINGS.currency,
      emailNotifications,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Persist settings to localStorage. Fails silently (private browsing, quota).
 *
 * Validation is enforced at the write boundary: only canonically valid settings
 * are persisted. If the input is invalid, the write is rejected and the caller
 * receives a false return value so failures are diagnosable without throwing.
 *
 * @param {unknown} settings
 * @returns {boolean} true if persisted, false if rejected or write failed.
 */
export function writeStoredSettings(settings) {
  const result = validateSettings(settings);
  if (!result.ok) {
    return false;
  }
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(result.value));
    return true;
  } catch {
    // ignore write failures
    return false;
  }
}

/**
 * Read the last-changed timestamp for settings from localStorage.
 *
 * @returns {number|null} ms since epoch, or null if never recorded / unavailable.
 */
export function readStoredSettingsUpdatedAt() {
  try {
    const stored = localStorage.getItem(SETTINGS_UPDATED_KEY);
    const parsed = stored ? Number(stored) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Persist the last-changed timestamp for settings. Fails silently.
 *
 * The timestamp is validated at the boundary: non-finite or negative values
 * are rejected. A valid timestamp must be a finite number >= 0.
 *
 * @param {unknown} updatedAt - ms since epoch
 * @returns {boolean} true if persisted, false if rejected or write failed.
 */
export function writeStoredSettingsUpdatedAt(updatedAt) {
  if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt) || updatedAt < 0) {
    return false;
  }
  try {
    localStorage.setItem(SETTINGS_UPDATED_KEY, String(updatedAt));
    return true;
  } catch {
    // ignore write failures
    return false;
  }
}
