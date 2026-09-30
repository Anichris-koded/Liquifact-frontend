/**
 * @file app/invest/[id]/loading.js
 *
 * Next.js App Router loading boundary for the invoice detail route.
 *
 * This file is rendered by Next.js whenever the detail page (`page.js`) is
 * suspended — for example on the initial navigation to `/invest/[id]` before
 * the Server Component has resolved `params` and called `getInvoiceById`.
 *
 * Concurrency invariants
 * ──────────────────────
 * Next.js may render this component concurrently alongside other route
 * segments (e.g. the parent `/invest` layout) or multiple times in quick
 * succession when the user navigates between invoice IDs in rapid sequence.
 * This file is therefore intentionally:
 *
 *   1. **Stateless** — no hooks, no side effects, no module-level mutable
 *      state. Every render is a pure function of props (none), so concurrent
 *      invocations produce identical output and cannot interfere.
 *
 *   2. **Non-suspending** — no async/await, no data fetching, no `use()` calls.
 *      A loading boundary that itself suspends would cause a white flash; all
 *      animation is CSS-only (`animate-pulse`).
 *
 *   3. **Layout-stable** — `InvoiceDetailSkeleton` mirrors the exact DOM
 *      shape of `page.js` (header height, section margins, action-button row).
 *      When the real page replaces this placeholder there is no cumulative
 *      layout shift (CLS ≈ 0).
 *
 * What changed and why (issue #1158)
 * ────────────────────────────────────
 * The previous version imported `InvoiceListSkeleton` (a list/marketplace
 * skeleton) instead of `InvoiceDetailSkeleton`. The structural mismatch meant:
 *
 *   • The loading UI presented a `<ul>` list of animated invoice-card rows
 *     rather than the detail page's heading / metadata section / timeline /
 *     action-buttons layout → measurable CLS when real content arrived.
 *
 *   • A duplicated filter-panel placeholder block (4 × `h-10 w-32` pills)
 *     was unrelated to the detail page shape.
 *
 *   • Under rapid concurrent navigations the mismatched shape exposed a
 *     window during which screen readers could announce list-loading copy
 *     ("Loading investable invoices…") for a detail page, confusing AT users.
 *
 * The fix:
 *   • Replace the mismatched composite with the dedicated `InvoiceDetailSkeleton`,
 *     which already carries `aria-busy="true"` and an `sr-only` announcement
 *     ("Loading invoice details, please wait…") internally.
 *   • `InvoiceDetailLoading` is now a single-line wrapper — stateless,
 *     side-effect-free, safe to render concurrently or in rapid succession.
 *
 * @see components/InvoiceDetailSkeleton.jsx — skeleton that mirrors page.js
 * @see app/invest/[id]/page.js              — the real detail page
 */

import InvoiceDetailSkeleton from "@/components/InvoiceDetailSkeleton";

/**
 * Detail-page loading boundary.
 *
 * Renders the content-shaped `InvoiceDetailSkeleton` placeholder while the
 * Server Component shell resolves the invoice. Stateless and side-effect-free
 * so concurrent renders and rapid re-mounts are safe.
 *
 * Invariants:
 *   - No module-level mutable state → concurrent renders cannot interfere.
 *   - No async work → this boundary never suspends itself.
 *   - Shape matches `page.js` → CLS is minimised when real content arrives.
 *   - `InvoiceDetailSkeleton` announces "Loading invoice details, please wait…"
 *     via `sr-only` → screen readers receive correct route-scoped copy.
 *
 * @returns {JSX.Element}
 */
export default function InvoiceDetailLoading() {
  return <InvoiceDetailSkeleton />;
}
