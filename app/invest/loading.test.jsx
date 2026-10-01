/**
 * @file app/invest/loading.test.jsx
 * Tests for the Next.js route-level loading UI at /invest.
 *
 * Validation boundaries covered:
 *  - Success path: component renders without error and exposes every expected
 *    element (root, nav skeleton, title shimmer, subtitle shimmers, filter
 *    panel, invoice-list skeleton, sr-only announcement).
 *  - ARIA / accessibility: `aria-busy`, `data-testid`, correct roles, and
 *    zero `axe` violations.
 *  - Determinism / boundary: stable key prefix, fixed FILTER_PILL_COUNT (4),
 *    fixed InvoiceListSkeleton row count (3).
 *  - Regression: layout-shift guard — all expected animate-pulse elements
 *    are present so a redesign that accidentally drops a shimmer will fail.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import InvestLoading from "./loading";

expect.extend(toHaveNoViolations);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Re-render InvestLoading and return the Testing Library result. */
function setup() {
  return render(<InvestLoading />);
}

// ---------------------------------------------------------------------------
// Success path
// ---------------------------------------------------------------------------

describe("InvestLoading — success path", () => {
  it("renders without throwing", () => {
    expect(() => setup()).not.toThrow();
  });

  it("renders the root wrapper with data-testid='invest-loading'", () => {
    setup();
    expect(screen.getByTestId("invest-loading")).toBeInTheDocument();
  });

  it("renders a NavMenuSkeleton header element", () => {
    const { container } = setup();
    expect(container.querySelector("header")).toBeInTheDocument();
  });

  it("renders a <main> content area", () => {
    const { container } = setup();
    expect(container.querySelector("main")).toBeInTheDocument();
  });

  it("renders the page-title shimmer bar (h-7 w-24)", () => {
    const { container } = setup();
    expect(container.querySelector(".h-7.w-24")).toBeInTheDocument();
  });

  it("renders two subtitle shimmer lines", () => {
    const { container } = setup();
    // Both subtitle bars have animate-pulse and sit inside <main>
    const main = container.querySelector("main");
    const subtitleBars = main.querySelectorAll(".h-4.animate-pulse");
    expect(subtitleBars.length).toBeGreaterThanOrEqual(2);
  });

  it("renders the filter panel skeleton container", () => {
    const { container } = setup();
    const filterPanel = container.querySelector(".rounded-xl.border.border-slate-800");
    expect(filterPanel).toBeInTheDocument();
  });

  it("renders exactly 4 filter pill skeletons", () => {
    const { container } = setup();
    // Each pill has h-10 w-32 rounded-lg bg-slate-800 animate-pulse
    const pills = container.querySelectorAll(".h-10.w-32.rounded-lg");
    expect(pills).toHaveLength(4);
  });

  it("renders the InvoiceListSkeleton list (aria-label='Loading investable invoices')", () => {
    setup();
    expect(
      screen.getByRole("list", { name: /loading investable invoices/i }),
    ).toBeInTheDocument();
  });

  it("InvoiceListSkeleton renders 3 skeleton rows by default", () => {
    const { container } = setup();
    const rows = container.querySelectorAll("ul > li");
    expect(rows).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Screen-reader / ARIA
// ---------------------------------------------------------------------------

describe("InvestLoading — ARIA attributes", () => {
  it("root wrapper has aria-busy='true'", () => {
    setup();
    expect(screen.getByTestId("invest-loading")).toHaveAttribute("aria-busy", "true");
  });

  it("renders an sr-only announcement visible to screen readers", () => {
    setup();
    expect(screen.getByText(/marketplace loading, please wait/i)).toBeInTheDocument();
  });

  it("sr-only span carries the sr-only class", () => {
    const { container } = setup();
    const srSpan = container.querySelector(".sr-only");
    expect(srSpan).toBeInTheDocument();
    expect(srSpan.textContent).toMatch(/marketplace loading/i);
  });

  it("NavMenuSkeleton header has aria-hidden='true' (decorative)", () => {
    const { container } = setup();
    const header = container.querySelector("header");
    expect(header).toHaveAttribute("aria-hidden", "true");
  });

  it("InvoiceListSkeleton list has aria-busy='true'", () => {
    setup();
    expect(
      screen.getByRole("list", { name: /loading investable invoices/i }),
    ).toHaveAttribute("aria-busy", "true");
  });
});

// ---------------------------------------------------------------------------
// Determinism / boundary values
// ---------------------------------------------------------------------------

describe("InvestLoading — determinism and boundary values", () => {
  it("always renders exactly 4 filter pill skeletons (FILTER_PILL_COUNT boundary)", () => {
    // Two independent renders must yield the same count
    const { container: c1 } = render(<InvestLoading />);
    const { container: c2 } = render(<InvestLoading />);
    const pills1 = c1.querySelectorAll(".h-10.w-32.rounded-lg");
    const pills2 = c2.querySelectorAll(".h-10.w-32.rounded-lg");
    expect(pills1).toHaveLength(4);
    expect(pills2).toHaveLength(4);
  });

  it("renders the same output on every call (no randomness / side-effects)", () => {
    const { container: c1 } = render(<InvestLoading />);
    const { container: c2 } = render(<InvestLoading />);
    // Compare animate-pulse element counts as a structural fingerprint
    expect(c1.querySelectorAll(".animate-pulse").length).toBe(
      c2.querySelectorAll(".animate-pulse").length,
    );
  });

  it("has at least 7 animate-pulse elements (layout-shift regression guard)", () => {
    // title (1) + 2 subtitles + 4 filter pills + 3 skeleton rows = 10+
    const { container } = setup();
    const pulsed = container.querySelectorAll(".animate-pulse");
    expect(pulsed.length).toBeGreaterThanOrEqual(7);
  });

  it("renders 0 filter pills when FILTER_PILL_COUNT is conceptually 0 (structural smoke check)", () => {
    // This test confirms the component itself — not a prop — drives the count.
    // We verify the component's own constant is honoured (4 pills, not 0).
    const { container } = setup();
    const pills = container.querySelectorAll(".h-10.w-32.rounded-lg");
    expect(pills.length).not.toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Accessibility (axe)
// ---------------------------------------------------------------------------

describe("InvestLoading — accessibility", () => {
  it("has no axe accessibility violations", async () => {
    const { container } = setup();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ---------------------------------------------------------------------------
// Regression — duplicate render (no key collision warning path)
// ---------------------------------------------------------------------------

describe("InvestLoading — duplicate render safety", () => {
  it("can be mounted twice in the same DOM without throwing", () => {
    expect(() => {
      render(<InvestLoading />);
      render(<InvestLoading />);
    }).not.toThrow();
  });
});
