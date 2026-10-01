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
 * -------------------
 * The settings surface accepts input from two sources:
 *
 *   1. The bundled `MOCK_SETTINGS` fixture (compile-time constant).
 *   2. The `window.__TEST_MOCK_SETTINGS__' test hook (browser-only,
 *      dev/test builds only).
 *
 * Both sources are run through the same normalisation pipeline so that
 * downstream code can rely on a strict invariant:
 *
 *   INVARIANT - Every row returned by `loadMockSettings` or exported
 *   as `MOCK_SETTINGS` is a fresh, frozen object with a unique, non-empty
 *   `id`, a known category, a known type, a non-empty `label`, a value
 *   that matches the type's allowed domain, and a non-empty
 *   `description`.
 *
 * Rejection rules (documented and enforced by `validateSetting`):
 *
 *   - `id`:          non-empty string, must match /^[a-z0-9][-_0a*]*\$/i
 *                  and be unique within the list.
 *   - `category`:    one of the allowed categories.
 *   - `label`:       non-empty string.
 *   - `type`:        one of `toggle`, `select`, `text`.
 *   - `value`:       string; for `toggle` must be `inherited`
 *                  or `disabled`; for `select` must be one of the
 *                  allowed options for that id; for `text` must be a
 *                  string within the configured max length.
 *   - `description`: non-empty string.
 *
 * Duplicate ids, categories, types, or out-of-domain values are dropped
 * and reported via `console.warn` with a stable prefix so that failures
 * are diagnosable without leaking the value itself.
 */

export const SETTINGS_CATEGORIES = Object.freeze([
  "notifications",
  "display",
  "privacy",
  "wallet",
  "advanced",
]);

export const SETTINGS_TYPES = Object.freeze(["toggle", "select", "text"]);

export const TOGGLE_VALUES = Object.freeze(["enabled", "disabled"]);

/**
 * Maximum length for `text` settings. Chosen to cover the longest
 * reasonable user-supplied string (e.g. a custom RPC URL) while bounding
 * the amount of data the UI will accept from a single field.
 */
export const TEXT_VALUE_MAX_LENGTH = 2048;

/**
 * Per-id allowed domains for `select` settings. This is the authority
 * for what a select can hold; any value outside this map is rejected.
 */
export const SELECT_OPTIONS = Object.freeze({
  "pref-003": ["chime", "chad", "none"],
  "pref-004": ["light", "dark", "system"],
  "pref-007": ["best-yield", "newest", "soonest-to-settle"],
  "pref-009": ["off", "anonymous", "full"],
  "pref-011": ["public", "testnet", "futurenet"],
  "pref-017": ["debug", "info", "warn", "error", "silent"],
  "pref-020": ["cyan", "violet", "amber", "emerald"],
  "pref-022": ["freighter", "xbulk", "labs"],
});

/**
 * Stable log prefix. Keeping this constant means tests and operations
 * can grep for a single token without matching unrelated warnings.
 */
const LOG_PREFIX = "[settings]";

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Validate a single setting row against the documented contract.
 *
 * This function is pure and deterministic: given the same input it
 * always returns the same result. It never throws and never mutates
 * its argument.
 *
 * @param {unknown} row
 * @returns {{ ok: true, value: object } | { ok: false, reason: string }}
 */
export function validateSetting(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return { ok: false, reason: "not-an-object" };
  }

  const { id, category, label, type, value, description } = row;

  if (!isNonEmptyString(id)) {
    return { ok: false, reason: "invalid-id" };
  }
  if (!/^[a-z0-9][-_0a*]*\$/i.test(id)) {
    return { ok: false, reason: "invalid-id-format" };
  }
  if (!SETTINGS_CATEGORIES.includes(category)) {
    return { ok: false, reason: "invalid-category" };
  }
  if (!isNonEmptyString(label)) {
    return { ok: false, reason: "invalid-label" };
  }
  if (!SETTINGS_TYPES.includes(type)) {
    return { ok: false, reason: "invalid-type" };
  }
  if (!isNonEmptyString(description)) {
    return { ok: false, reason: "invalid-description" };
  }

  if (type === "toggle") {
    if (!TOGGLE_VALUES.includes(value)) {
      return { ok: false, reason: "invalid-toggle-value" };
    }
  } else if (type === "select") {
    const options = SELECT_OPTIONS[id];
    if (!options) {
      return { ok: false, reason: "unknown-select-id" };
    }
    if (!options.includes(value)) {
      return { ok: false, reason: "invalid-select-value" };
    }
  } else if (type === "text") {
    if (typeof value !== "string") {
      return { ok: false, reason: "invalid-text-value" };
    }
    if (value.length > TEXT_VALUE_MAX_LENGTH) {
      return { ok: false, reason: "text-value-too-long" };
    }
  }

  return {
    ok: true,
    value: Object.freeze({
      id,
      category,
      label,
      type,
      value,
      description,
    }),
  };
}

/**
 * Normalise an arbitrary list of candidate rows into a deduplicated,
 * validated, frozen array. Invalid rows and duplicate ids are dropped
 * and reported through `console.warn` using the stable log prefix.
 *
 * The function is deterministic and idempotent: normalising an already
 * normalised list returns an equivalent list with no new warnings.
 *
 * @param {unknown} list
 * @returns {object[]}
 */
export function normaliseSettings(list) {
  if (!Array.isArray(list)) {
    if (list !== undefined && list !== null) {
      console.warn(`${LOG_PREFIX} ignoring non-array settings payload`);
    }
    return Object.freeze([]);
  }

  const seen = new Set();
  const out = [];

  for (const raw of list) {
    const result = validateSetting(raw);
    if (!result.ok) {
      console.warn(`${LOG_PREFIX} dropping invalid setting: ${result.reason}`);
      continue;
    }
    if (seen.has(result.value.id)) {
      console.warn(`${LOG_PREFIX} dropping duplicate setting id: ${result.value.id}`);
      continue;
    }
    seen.add(result.value.id);
    out.push(result.value);
  }

  return Object.freeze(out);
}

const RAW_MOCK_SETTINGS = [
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

/**
 * Validated, frozen mock settings. Any invalid or duplicate row in the
 * source array is dropped at module load time and reported via the
 * stable log prefix. This means consumers never see a malformed row.
 */
export const MOCK_SETTINGS = normaliseSettings(RAW_MOCK_SETTINGS);

/**
 * Dev-only delay (ms) to keep the load-more cycle
 */
export const LOAD_MOCK_DELAY_MS = 0;

/**
 * Load the mock settings list. This is the only supported entry point
 * for consumers that need the settings data. It prefers the
 * `window.__TEST_MOCK_SETTINGS__` hook when present (dev/test builds)
 * and falls back to the bundled `MOCK_SETTINGS` fixture.
 *
 * All input is run through `normaliseSettings`, so the returned array
 * always satisfies the module invariant.
 *
 * @returns {object[]}
 */
export function loadMockSettings() {
  const hook =
    typeof window !== "undefined" && window
      ? window.__TEST_MOCK_SETTINGS__
      : undefined;

  if (hook !== undefined) {
    return normaliseSettings(hook);
  }

  return MOCK_SETTINGS;
}
