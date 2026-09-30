/**
 * @file app/settings/loading.js
 * Next.js route-level loading UI for the /settings page.
 *
 * Rendered automatically by the Next.js App Router while the page segment
 * is streaming. Delegates the content area to the reusable ThemeSkeleton
 * component so both stay in sync with the real settings layout.
 *
 * Validation boundaries
 * -------------------
 * This is a pure presentational skeleton with no user input and no side
 * effects. The only invariants worth enforcing are:
 *
 *  1. The shell must always announce itself as busy (`aria-busy="true"`)
 *     and expose a stable `testid` so tests and assistive tech can find
 *     it deterministically.
 *  2. The `isBusy` prop forwarded to ThemeSkeleton must be a boolean.
 *     Non-boolean values (undefined, null, strings, numbers) are
 *     coerced to `true` so the skeleton never silently renders as non-busy
 *     while the route is still streaming.
 *  3. The component must remain a pure function of its props — no
 *     module-level mutable state, no timers, no network calls — so that
 *     concurrent renders and retries cannot produce an inconsistent result.
 *
 * @see components/ThemeSkeleton.jsx — reusable theme/settings skeleton
 */
import React from "react";
import NavMenuSkeleton from "../../components/NavMenuSkeleton";
import ThemeSkeleton from "../../components/ThemeSkeleton";

/** Stable test id for the route-level loading shell. */
export const SETTINGS_LOADING_TEST_ID = "settings-loading";

/**
 * Normalize the `isBusy` prop to a boolean.
 *
 * The skeleton is only ever rendered while the /settings route is
 * streaming, so any non-boolean input is treated as "busy". This keeps
 * the validation boundary deterministic for valid, invalid, and
 * boundary-case inputs without throwing during render.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function normalizeIsBusy(value) {
  return value === false ? false : true;
}

/**
 * Route-level loading UI for /settings.
 *
 * @param {object} [props]
 * @param {boolean} [props.isBusy=true] - whether the skeleton should
 *   announce itself as busy. Defaults to `true` because this component
 *   is only mounted while the route is loading.
 */
export default function SettingsLoading({ isBusy = true } = {}) {
  const busy = normalizeIsBusy(isBusy);

  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-50"
      aria-busy={busy ? "true" : "false"}
      data-testid={SETTINGS_LOADING_TEST_ID}
    >
      {/* ---- Reusable nav skeleton ---- */}
      <NavMenuSkeleton />

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        {/* ---- Reusable theme/settings skeleton ---- */}
        <ThemeSkeleton isBusy={busy} />
      </main>
    </div>
  );
}
