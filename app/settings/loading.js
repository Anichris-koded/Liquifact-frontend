// @ts-check
/**
 * @file app/settings/loading.js
 * Next.js route-level loading UI for the /settings page.
 *
 * Rendered automatically by the Next.js App Router while the page segment
 * is streaming. Delegates the content area to the reusable ThemeSkeleton
 * component so both stay in sync with the real settings layout.
 *
 * Validation boundaries
 * --------------------
 * This module exposes a pure, deterministic descriptor (`getSettingsLoadingState`)
 * that normalises the route-level loading props into a single canonical shape
 * before rendering. The component is a pure function of that descriptor, so:
 *
 *   - Valid input -> deterministic skeleton with aria-busy="true".
 *   - Invalid input (wrong types, out-of-range delays) -> clamped/defaulted,
 *     never throws, and surfaces a development-only warning.
 *   - Duplicate submissions (concurrent loading segments) -> idempotent output.
 *   - Boundary values (0, max, NaN, Infinity, strings) -> clamped to [0, MAX].
 *
 * The descriptor is intentionally free of DOM and side effects so it can be
 * tested in isolation and reused by future loading segments.
 *
 * @see components/ThemeSkeleton.jsx — reusable theme/settings skeleton
 */
import PropTypes from "prop-types";
import NavMenuSkeleton from "../../components/NavMenuSkeleton";
import ThemeSkeleton from "../../components/ThemeSkeleton";

/** Maximum accepted skeleton delay in milliseconds. */
export const MAX_SKELETON_DELAY_MS = 60_000;

/** Default skeleton delay in milliseconds. */
export const DEFAULT_SKELETON_DELAY_MS = 0;

/** Default accessible label used when no valid label is supplied. */
export const DEFAULT_SKELETON_LABEL = "Theme settings loading, please wait";

/** Allowed literal values for the `reducedMotion` flag. */
const ACCEPTED_REDUCED_MOTION_VALUES = ["system", "reduce", "no-preference"];

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Clamp an arbitrary input into a finite delay in [0, MAX_SKELETON_DELAY_MS].
 *
 * Non-finite or non-numeric inputs fall back to DEFAULT_SKELETON_DELAY_MS.
 *
 * @param {unknown} value
 * @returns {number}
 */
export function clampSkeletonDelay(value) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_SKELETON_DELAY_MS;
  if (numeric < 0) return 0;
  if (numeric > MAX_SKELETON_DELAY_MS) return MAX_SKELETON_DELAY_MS;
  return Math.floor(numeric);
}

/**
 * Normalise the `reducedMotion` flag. Only the documented literals are
 * accepted; anything else falls back to "system".
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normaliseReducedMotion(value) {
  if (typeof value !== "string") return "system";
  const normalised = value.trim().toLowerCase();
  return ACCEPTED_REDUCED_MOTION_VALUES.includes(normalised)
    ? normalised
    : "system";
}

/**
 * Build the canonical descriptor for the /settings loading segment.
 *
 * This function is the single validation boundary for the loading UI:
 * every field is either accepted as-is (when valid) or coerced to a safe
 * default. It never throws and never returns `undefined` fields.
 *
 * @param {object} [props]
 * @param {unknown} [props.delayMs]
 * @param {unknown} [props.reducedMotion]
 * @param {unknown} [props.label]
 * @returns {{ delayMs: number, reducedMotion: string, label: string }}
 */
export function getSettingsLoadingState(props = {}) {
  const safe = isPlainObject(props) ? props : {};
  const label =
    typeof safe.label === "string" && safe.label.trim().length > 0
      ? safe.label.trim()
      : DEFAULT_SKELETON_LABEL;
  return {
    delayMs: clampSkeletonDelay(safe.delayMs),
    reducedMotion: normaliseReducedMotion(safe.reducedMotion),
    label,
  };
}

/**
 * Route-level loading UI for /settings.
 *
 * @param {object} [props]
 * @param {unknown} [props.delayMs]
 * @param {unknown} [props.reducedMotion]
 * @param {unknown} [props.label]
 * @returns {JSX.Element}
 */
export default function SettingsLoading(props) {
  const { delayMs, reducedMotion, label } = getSettingsLoadingState(props);

  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-50"
      aria-busy="true"
      data-testid="settings-loading"
      data-delay-ms={delayMs}
      data-reduced-motion={reducedMotion}
    >
      {/* ---- Reusable nav skeleton ---- */}
      <NavMenuSkeleton />

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        {/* ---- Reusable theme/settings skeleton ---- */}
        <ThemeSkeleton isBusy={true} label={label} />
      </main>
    </div>
  );
}

SettingsLoading.propTypes = {
  delayMs: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  reducedMotion: PropTypes.string,
  label: PropTypes.string,
};

SettingsLoading.defaultProps = {};
