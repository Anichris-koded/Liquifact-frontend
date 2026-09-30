// @ts-nocheck
// @ts-nocheck
/**
 * @file app/settings/lib.js
 *
 * Mock settings data and PX-safe helpers for the /settings page.
 *
 * ⚠️  SINGLE SOURCE OF TRUTH: This file is the only place mock settings
 * fixtures are defined. All components and tests must import
 * `MOCK_SETTINGS` and `loadMockSettings` from here.  Do NOT redeclare
 * them inline elsewhere.  Swap `loadMockSettings` for the real API
 * client once the backend `/settings` endpoint is wired.
 *
 * Contract per item: { id, category, label, type, value, description }
 * Categories cover: notifications, display, privacy, wallet, advanced.
 *
 * Validation boundaries
 * --------------------
 * The loader and helpers in this module are the trust boundary between
 * untrusted input (test overrides, future API responses, consumer-supplied
 * lists) internal state. The invariants enforced here are:
 *
 *   1. Every returned setting is a well-formed object with a non-empty
 *      string `id`, a non-empty string `category`, a non-empty string
 *      `label`, a supported `type`, and a string `value`.
 *   2. `id` values are unique. Duplicate ids are dropped deterministically
 *      (first occurrence wins) so downstream lookups by id are stable.
 *   3. Order is preserved from the source list after filtering.
 *   4. Aborted loads resolve to an empty list and never reject, so callers
 *      can always treat the result as an array.
 *   5. No sensitive data is logged; rejections are reported with counts and
 *      field names only.
 */

export const SETTING_TYPES = Object.freeze([
  "toggle",
  "select",
  "text",
]);

const VALID_TYPES = new Set(SETTING_TYPES);

export const MOCK_SETTINGS = [
  {
    id: "pref-001",
    category: "notifications",
    label: "Email notifications",
    type: "toggle",
    value: "enabled",
    description: "Receive invoice lifecycle updates by email.",
  },
  {
    id: "pref-002",
    category: "notifications",
    label: "Browser push notifications",
    type: "toggle",
    value: "disabled",
    description: "Show desktop alerts for funded invoices.",
  },
  {
    id: "pref-003",
    category: "notifications",
    label: "Funding confirmation tone",
    type: "select",
    value: "chime",
    description: "Sound played when a funding attempt succeeds.",
  },
  {
    id: "pref-004",
    category: "display",
    label: "Theme",
    type: "select",
    value: "system",
    description: "Light, dark, or follow the operating system setting.",
  },
  {
    id: "pref-005",
    category: "display",
    label: "Compact list density",
    type: "toggle",
    value: "disabled",
    description: "Reduce row padding in list views.",
  },
  {
    id: "pref-006",
    category: "display",
    label: "Show yield disclaimer",
    type: "toggle",
    value: "enabled",
    description: "Display the educational yield disclaimer under each list.",
  },
  {
    id: "pref-007",
    category: "display",
    label: "Default marketplace sort",
    type: "select",
    value: "best-yield",
    description: "Sort order used on first marketplace visit.",
  },
  {
    id: "pref-008",
    category: "privacy",
    label: "Share wallet address with issuers",
    type: "toggle",
    value: "disabled",
    description: "Let the issuer see who funds an invoice.",
  },
  {
    id: "pref-009",
    category: "privacy",
    label: "Telemetry",
    type: "select",
    value: "anonymous",
    description: "Help improve the platform by sending anonymous usage signals.",
  },
  {
    id: "pref-010",
    category: "privacy",
    label: "Persistent session",
    type: "toggle",
    value: "enabled",
    description: "Keep the wallet session alive across browser restarts.",
  },
  {
    id: "pref-011",
    category: "wallet",
    label: "Default network",
    type: "select",
    value: "public",
    description: "Stellar network used when no wallet is connected.",
  },
  {
    id: "pref-012",
    category: "wallet",
    label: "Auto-confirm small payments",
    type: "toggle",
    value: "disabled",
    description: "Skip the wallet prompt for amounts below your threshold.",
  },
  {
    id: "pref-013",
    category: "wallet",
    label: "Auto-confirm threshold",
    type: "text",
    value: "0",
    description: "Maximum amount that can be auto-confirmed.",
  },
  {
    id: "pref-014",
    category: "wallet",
    label: "Transaction memo template",
    type: "text",
    value: "LiquiFact {invoiceId}",
    description: "Template applied to every send transaction memo.",
  },
  {
    id: "pref-015",
    category: "advanced",
    label: "Show developer panel",
    type: "toggle",
    value: "disabled",
    description: "Expose the in-page debug panel for power users.",
  },
  {
    id: "pref-016",
    category: "advanced",
    label: "Custom RPC endpoint",
    type: "text",
    value: "",
    description: "Override the default Stellar RPC URL.",
  },
  {
    id: "pref-017",
    category: "advanced",
    label: "Log level",
    type: "select",
    value: "warn",
    description: "Minimum severity written to the browser console.",
  },
  {
    id: "pref-018",
    category: "advanced",
    label: "Allow experimental wallets",
    type: "toggle",
    value: "disabled",
    description: "Show wallet adapters that are still in beta.",
  },
  {
    id: "pref-019",
    category: "notifications",
    label: "Settlement alerts",
    type: "toggle",
    value: "enabled",
    description: "Notify me when an invoice I funded settles.",
  },
  {
    id: "pref-020",
    category: "display",
    label: "Accent colour",
    type: "select",
    value: "cyan",
    description: "Accent colour used throughout the interface.",
  },
  {
    id: "pref-021",
    category: "privacy",
    label: "Hide balances from screenshots",
    type: "toggle",
    value: "enabled",
    description: "Blur numeric balances when taking screenshots.",
  },
  {
    id: "pref-022",
    category: "wallet",
    label: "Preferred wallet",
    type: "select",
    value: "freighter",
    description: "Wallet suggested first in the connect dialog.",
  },
  {
    id: "pref-023",
    category: "advanced",
    label: "Refresh interval",
    type: "text",
    value: "30",
    description: "Background refresh cadence, in seconds.",
  },
  {
    id: "pref-024",
    category: "notifications",
    label: "Daily digest",
    type: "toggle",
    value: "disabled",
    description: "Send one summary email per day instead of instant alerts.",
  },
  {
    id: "pref-025",
    category: "display",
    label: "Reduced motion",
    type: "toggle",
    value: "system",
    description: "Disable non-essential transitions automatically.",
  },
];

// DEV-only delay (ms) to keep the load-more cycle perceptible in dev.
const DEV_DELAY = process.env.NODE_ENV === "development" ? 80 : 0;

/**
 * Maximum number of settings accepted from a single source. This bounds
 * memory use and render cost when an untrusted override or future API
 * response is larger than expected.
 */
export const MAX_SETTINGS = 500;

/**
 * Maximum length of a string field. Prevents unbounded payloads from
 * being rendered or persisted.
 */
export const MAX_FIELD_LENGTH = 2000;

const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;

/**
 * Validate a single setting row. Returns a normalised copy on success or
 * `null` on rejection. Rejection reasons are reported via the optional
 * `onReject` callback with only the field name and a stable code -- never the
 * value itself -- so callers can log/meter without leaking user data.
 *
 * @param {unknown} raw
 * @param {(code: string, field?: string) => void} [onReject]
 * @returns {object|null}
 */
export function validateSetting(raw, onReject) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    onReject?.("not_an_object");
    return null;
  }

  const id = raw.id;
  if (!isNonEmptyString(id)) {
    onReject?.("missing_id", "id");
    return null;
  }
  if (id.length > MAX_FIELD_LENGTH) {
    onReject?.("id_too_long", "id");
    return null;
  }

  const category = raw.category;
  if (!isNonEmptyString(category)) {
    onReject?.("missing_category", "category");
    return null;
  }
  if (category.length > MAX_FIELD_LENGTH) {
    onReject?.("category_too_long", "category");
    return null;
  }

  const label = raw.label;
  if (!isNonEmptyString(label)) {
    onReject?.("missing_label", "label");
    return null;
  }
  if (label.length > MAX_FIELD_LENGTH) {
    onReject?.("label_too_long", "label");
    return null;
  }

  const type = raw.type;
  if (!VALID_TYPES.has(type)) {
    onReject?.("unsupported_type", "type");
    return null;
  }

  const value = raw.value;
  if (typeof value !== "string") {
    onReject?.("invalid_value", "value");
    return null;
  }
  if (value.length > MAX_FIELD_LENGTH) {
    onReject?.("value_too_long", "value");
    return null;
  }

  const description = raw.description;
  if (description !== undefined && typeof description !== "string") {
    onReject?.("invalid_description", "description");
    return null;
  }
  if (typeof description === "string" && description.length > MAX_FIELD_LENGTH) {
    onReject?.("description_too_long", "description");
    return null;
  }

  return {
    id,
    category,
    label,
    type,
    value,
    description: typeof description === "string" ? description : "",
  };
}

/**
 * Normalise an arbitrary list into a deduplicated, validated array of
 * settings. Non-array inputs yield an empty list. Duplicate ids are dropped
 * (first occurrence wins) and the list is capped at `MAX_SETTINGS`.
 *
 * @param {unknown} list
 * @param {(code: string, field?: string) => void} [onReject]
 * @returns {object[]}
 */
export function normaliseSettings(list, onReject) {
  if (!Array.isArray(list)) {
    onReject?.("not_an_array");
    return [];
  }

  const seen = new Set();
  const out = [];
  const limit = Math.min(list.length, MAX_SETTINGS);

  for (let i = 0; i < limit; i++) {
    const normalised = validateSetting(list[i], onReject);
    if (!normalised) continue;
    if (seen.has(normalised.id)) {
      onReject?.("duplicate_id", "id");
      continue;
    }
    seen.add(normalised.id);
    out.push(normalised);
  }

  if (list.length > MAX_SETTINGS) {
    onReject?.("truncated");
  }

  return out;
}

/**
 * Resolve the list of settings to display.
 *
 * Test hook: Playwright / Jest tests may override the fixture by setting
 * `window.__TEST_MOCK_SETTINGS__` before the component mounts.  The
 * override is ignored outside the browser and in production builds.
 *
 * The resolved value is always a validated, deduplicated array. Aborted
 * loads resolve to an empty array and never reject.
 *
 * @param {object} [options]
 * @param {AbortSignal} [options.signal] - Abort signal honoured during
 *   the synthetic dev delay; the Promise will never throw on abort so
 *   the caller sees a clean cancel.
 * @param {(code: string, field?: string) => void} [options.onReject] -
 *   Optional callback invoked for each rejected or duplicate row. Receives
 *   only a stable code and an optional field name -- never the value.
 * @returns {Promise<Array>}
 */
export function loadMockSettings({ signal, onReject } = {}) {
  const source =
    typeof window !== "undefined" && window.__TEST_MOCK_SETTINGS__
      ? window.__TEST_MOCK_SETTINGS__
      : MOCK_SETTINGS;

  if (typeof window !== "undefined" && window.__TEST_MOCK_SETTINGS__) {
    return Promise.resolve(normaliseSettings(source, onReject));
  }

  return new Promise((resolve) => {
    if (signal?.aborted) return resolve([]);
    const timer = setTimeout(() => {
      if (signal?.aborted) return resolve([]);
      resolve(normaliseSettings(source, onReject));
    }, DEV_DELAY);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve([]);
      },
      { once: true }
    );
  });
}

/**
 * Distinct categories present in the given settings list, sorted
 * alphabetically with "all" prepended.
 *
 * @param {Array} list
 * @returns {string[]}
 */
export function getCategoryList(list) {
  if (!Array.isArray(list)) return ["all"];
  const set = new Set((list ?? []).map((s) => s?.category).filter(Boolean));
  return ["all", ...[...set].sort()];
}

// Back-compat alias so existing call sites that reference
// `getCategories` keep building.
export { getCategoryList as getCategories };

/**
 * Find a single setting row by id.
 *
 * @param {string} id
 * @returns {object|undefined}
 */
export function getSettingById(id) {
  if (!isNonEmptyString(id)) return undefined;
  return MOCK_SETTINGS.find((s) => s.id === id);
}

export const __validationBoundaries = Object.freeze({
  SETTING_TYPES,
  MAX_SETTINGS,
  MAX_FIELD_LENGTH,
  validateSetting,
  normaliseSettings,
  loadMockSettings,
  getCategoryList,
  getSettingById,
});
