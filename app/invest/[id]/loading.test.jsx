/**
 * @file app/invest/[id]/loading.test.jsx
 *
 * Regression tests for the invoice detail loading boundary (issue #1158).
 *
 * Failure scenarios covered
 * ──────────────────────────
 * 1. Correct skeleton rendered — `InvoiceDetailSkeleton`, not the marketplace
 *    list skeleton (`InvoiceListSkeleton`).
 * 2. Screen-reader announcement — an `sr-only` string scoped to "invoice
 *    details" is present so AT users hear the right copy during navigation.
 * 3. `aria-busy` propagation — the root element signals "busy" to assistive
 *    technology so dynamic content regions update correctly.
 * 4. No interactive elements — a loading boundary must never contain focusable
 *    or operable controls; keyboard users should not be able to land here.
 * 5. No layout-shifting list structure — the old `<ul>` from `InvoiceListSkeleton`
 *    must be absent; its presence would indicate a regression to the mismatched
 *    skeleton.
 * 6. Stateless / idempotent — rendering the component twice (simulating
 *    concurrent requests) produces identical output.
 * 7. Axe accessibility — no violations in either render.
 * 8. Reduced-motion — `animate-pulse` blocks are present in the DOM; the CSS
 *    media query that disables them is exercised separately in globals.css tests
 *    but we assert the elements exist so reduced-motion CSS has something to act on.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import "@testing-library/jest-dom";
import InvoiceDetailLoading from "./loading";

expect.extend(toHaveNoViolations);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Render once and return the container. */
function setup() {
  return render(<InvoiceDetailLoading />);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("app/invest/[id]/loading — InvoiceDetailLoading (issue #1158)", () => {
  // ── 1. Correct skeleton ──────────────────────────────────────────────────

  it("renders the invoice-detail skeleton, not the marketplace list skeleton", () => {
    const { container } = setup();
    // InvoiceDetailSkeleton renders a <main> with a disclaimer block at the end.
    // InvoiceListSkeleton renders a <ul> — its absence is the regression guard.
    expect(container.querySelector("ul")).toBeNull();
    expect(container.querySelector("main")).toBeInTheDocument();
  });

  it("does NOT render InvoiceListSkeleton's 'Loading investable invoices' label", () => {
    setup();
    // This string is the aria-label on InvoiceListSkeleton's <ul>.
    // Its presence would mean the wrong skeleton is still being used.
    expect(
      screen.queryByLabelText(/loading investable invoices/i)
    ).not.toBeInTheDocument();
  });

  // ── 2. Screen-reader announcement (detail-scoped copy) ──────────────────

  it("contains an sr-only announcement scoped to invoice *details*", () => {
    setup();
    // InvoiceDetailSkeleton renders:
    //   <span className="sr-only">Loading invoice details, please wait…</span>
    expect(
      screen.getByText(/loading invoice details/i)
    ).toBeInTheDocument();
  });

  it("sr-only text is not 'Loading invoices' (marketplace copy leak)", () => {
    setup();
    // Regression guard: the old InvoiceListSkeleton used "Loading invoices,
    // please wait…" — ensure that copy is absent from this boundary.
    expect(
      screen.queryByText(/^loading invoices,/i)
    ).not.toBeInTheDocument();
  });

  // ── 3. aria-busy propagation ─────────────────────────────────────────────

  it("root element carries aria-busy='true'", () => {
    const { container } = setup();
    // InvoiceDetailSkeleton wraps everything in a div with aria-busy="true".
    const root = container.firstChild;
    expect(root).toHaveAttribute("aria-busy", "true");
  });

  // ── 4. No interactive elements ───────────────────────────────────────────

  it("contains no focusable interactive elements", () => {
    const { container } = setup();
    const interactive = container.querySelectorAll(
      "a, button, input, select, textarea, [tabindex]"
    );
    expect(interactive.length).toBe(0);
  });

  // ── 5. No list structure from the marketplace skeleton ───────────────────

  it("renders no <ul> or <li> elements (marketplace skeleton structure absent)", () => {
    const { container } = setup();
    expect(container.querySelector("ul")).toBeNull();
    expect(container.querySelector("li")).toBeNull();
  });

  // ── 6. Idempotent / concurrent-render safety ─────────────────────────────

  it("produces identical HTML across two concurrent renders (stateless invariant)", () => {
    const { container: a } = render(<InvoiceDetailLoading />);
    const { container: b } = render(<InvoiceDetailLoading />);
    expect(a.innerHTML).toBe(b.innerHTML);
  });

  // ── 7. Axe accessibility ─────────────────────────────────────────────────

  it("has no axe accessibility violations", async () => {
    const { container } = setup();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  // ── 8. Animate-pulse elements present (reduced-motion CSS hook) ──────────

  it("renders at least one animate-pulse element (reduced-motion CSS has a target)", () => {
    const { container } = setup();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  // ── 9. Structural shape mirrors the detail page ──────────────────────────

  it("renders a <header> placeholder and a <main> content area", () => {
    const { container } = setup();
    expect(container.querySelector("header")).toBeInTheDocument();
    expect(container.querySelector("main")).toBeInTheDocument();
  });

  it("renders a metadata section placeholder (invoice summary area)", () => {
    const { container } = setup();
    // InvoiceDetailSkeleton renders multiple <section> blocks for the
    // metadata and timeline areas — at least one must be present.
    const sections = container.querySelectorAll("section");
    expect(sections.length).toBeGreaterThanOrEqual(1);
  });

  it("renders action-button placeholders matching the FundActions row", () => {
    const { container } = setup();
    // InvoiceDetailSkeleton has 3 rounded-full button-shaped skeletons.
    const btnPlaceholders = container.querySelectorAll(".rounded-full.animate-pulse");
    expect(btnPlaceholders.length).toBeGreaterThanOrEqual(3);
  });

  // ── 10. Boundary shape — no filter panel (regression from old loading.js) ─

  it("does NOT render the 4-pill filter-panel placeholder from the old loading.js", () => {
    const { container } = setup();
    // The old loading.js rendered:
    //   <div className="mb-8 rounded-xl ... p-6">
    //     <div className="flex flex-wrap gap-4">
    //       {Array.from({ length: 4 }).map((_, i) => (
    //         <div key={i} className="h-10 w-32 rounded-lg bg-slate-800 animate-pulse" />
    //       ))}
    //     </div>
    //   </div>
    // That shape is absent from InvoiceDetailSkeleton.
    const filterPills = container.querySelectorAll(".h-10.w-32.rounded-lg");
    expect(filterPills.length).toBe(0);
  });
});
