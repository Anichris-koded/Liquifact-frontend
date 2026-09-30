/**
 * @file app/invest/loading.js
 * Next.js route-level loading UI for the /invest (marketplace) page.
 *
 * Rendered automatically by the Next.js App Router while the page segment
 * is streaming. The shell intentionally mirrors the real InvestMarketplace
 * layout so the visual dimensions are stable and no layout shift occurs
 * when the live page replaces this skeleton.
 *
 * Accessibility notes:
 * - `aria-busy="true"` on the root signals an in-progress state to
 *   assistive technologies that poll the element.
 * - `data-testid="invest-loading"` provides a stable, deterministic hook
 *   for unit and integration tests so selectors never depend on CSS classes
 *   or text content that may change during redesigns.
 * - The `<span className="sr-only">` announces the loading state to screen
 *   readers immediately — important for users who land on this skeleton
 *   via keyboard navigation or a hard refresh.
 * - The decorative filter and list skeletons are presentational only; their
 *   own aria attributes are handled by the child components they contain.
 *
 * @see components/NavMenuSkeleton.jsx     — reusable nav placeholder
 * @see components/InvoiceListSkeleton.jsx — reusable list placeholder
 */
import InvoiceListSkeleton from "../../components/InvoiceListSkeleton";
import NavMenuSkeleton from "../../components/NavMenuSkeleton";

/** Number of filter pill skeletons to render (mirrors the real filter panel). */
const FILTER_PILL_COUNT = 4;

/**
 * Route-level loading skeleton for the investor marketplace.
 *
 * Mirrors the page structure of `/invest/page.js`:
 *  1. Sticky nav skeleton (`NavMenuSkeleton`)
 *  2. Page title + subtitle shimmer bars
 *  3. Filter panel skeleton (pill-shaped shimmer chips)
 *  4. Invoice list skeleton (`InvoiceListSkeleton`)
 *
 * The component accepts no props — it is always rendered with identical,
 * deterministic output so tests can assert on its structure reliably.
 *
 * @returns {React.ReactElement}
 */
export default function InvestLoading() {
  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100"
      aria-busy="true"
      data-testid="invest-loading"
    >
      {/* ---- Screen-reader announcement ---- */}
      <span className="sr-only">Marketplace loading, please wait…</span>

      {/* ---- Reusable nav skeleton ---- */}
      <NavMenuSkeleton />

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* ---- Page title skeleton ---- */}
        <div className="h-7 w-24 rounded bg-slate-700 animate-pulse mb-2" />

        {/* ---- Subtitle lines ---- */}
        <div className="h-4 w-full max-w-xl rounded bg-slate-800 animate-pulse mb-2" />
        <div className="h-4 w-3/4 max-w-lg rounded bg-slate-800 animate-pulse mb-8" />

        {/* ---- Filter panel skeleton ---- */}
        <div className="mb-8 rounded-xl border border-slate-800 bg-slate-900/30 p-6">
          <div className="flex flex-wrap gap-4">
            {Array.from({ length: FILTER_PILL_COUNT }).map((_, i) => (
              // Use a stable prefix so key is deterministic across renders
              <div
                key={`filter-skeleton-${i}`}
                className="h-10 w-32 rounded-lg bg-slate-800 animate-pulse"
              />
            ))}
          </div>
        </div>

        {/* ---- Invoice list skeleton ---- */}
        <InvoiceListSkeleton rows={3} />
      </main>
    </div>
  );
}
