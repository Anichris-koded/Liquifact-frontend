/* eslint-disable */
/* eslint-disable */
/**
 * @file app/settings/loading.test.jsx
 * Tests for the Next.js route-level loading UI at /settings.
 *
 * Verifies that SettingsLoading:
 *  - renders without errors
 *  - delegates to ThemeSkeleton
 *  - exposes the correct ARIA attributes on the page shell
 *  - has no accessibility violations
 *
 * This file also defines the validation boundaries for the loading UI: the
 * component is a pure, side-effect-free presentational boundary. The tests below
 * assert the invariants that make it safe to render repeatedly, concurrently,
 * and without any external input contract.
 *
 * Invariants:
 *  1. Rendering is deterministic and idempotent (no global mutations, no
 *     network, no timers, no randomness).
 *  2. The component accepts no props and ignores extraneous props without
 *     throwing (rejection is graceful, not a collapse).
 *  3. The ARIA contract (aria-busy="true") is stable across re-renders.
 *  4. Duplicate mounts produce independent, identical trees (no shared state).
 */

// @ts-nocheck
// @ts-nocheck
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import SettingsLoading from "./loading";

expect.extend(toHaveNoViolations);

describe("SettingsLoading", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders without crashing", () => {
    expect(() => render(<SettingsLoading />)).not.toThrow();
  });

  it("renders the page root with data-testid='settings-loading'", () => {
    render(<SettingsLoading />);
    expect(screen.getByTestId("settings-loading")).toBeInTheDocument();
  });

  it("renders the page root with aria-busy='true'", () => {
    render(<SettingsLoading />);
    expect(screen.getByTestId("settings-loading")).toHaveAttribute("aria-busy", "true");
  });

  it("renders the NavMenuSkeleton header", () => {
    const { container } = render(<SettingsLoading />);
    const header = container.querySelector("header");
    expect(header).toBeInTheDocument();
  });

  it("renders the ThemeSkeleton component (data-testid='theme-skeleton')", () => {
    render(<SettingsLoading />);
    expect(screen.getByTestId("theme-skeleton")).toBeInTheDocument();
  });

  it("ThemeSkeleton inside SettingsLoading has aria-busy='true'", () => {
    render(<SettingsLoading />);
    expect(screen.getByTestId("theme-skeleton")).toHaveAttribute("aria-busy", "true");
  });

  it("contains the sr-only loading announcement from ThemeSkeleton", () => {
    render(<SettingsLoading />);
    expect(screen.getByText(/theme settings loading, please wait/i)).toBeInTheDocument();
  });

  it("has multiple animate-pulse elements", () => {
    const { container } = render(<SettingsLoading />);
    const pulsed = container.querySelectorAll(".animate-pulse");
    expect(pulsed.length).toBeGreaterThanOrEqual(5);
  });

  it("has no axe accessibility violations", async () => {
    const { container } = render(<SettingsLoading />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  // --------------------------------------------------------------------------
  // Validation boundaries: accepted / rejected / duplicate / boundary inputs
  // --------------------------------------------------------------------------

  describe("validation boundaries", () => {
    it("accepts the default (no-props) invocation and renders the full shell", () => {
      render(<SettingsLoading />);
      expect(screen.getByTestId("settings-loading")).toBeInTheDocument();
      expect(screen.getByTestId("theme-skeleton")).toBeInTheDocument();
    });

    it("gracefully rejects unknown props without throwing or weakening the ARIA contract", () => {
      // The loading UI has no input contract; extraneous props must be
      // ignored (not propagated into the DOM) and must not alter ARIA.
      expect(() =>
        render(<SettingsLoading unknownProp="unexpected" data-extra="1" />)
      ).not.toThrow();

      const root = screen.getByTestId("settings-loading");
      expect(root).toHaveAttribute("aria-busy", "true");
      expect(root).not.toHaveAttribute("unknownProp");
      expect(root).not.toHaveAttribute("data-extra");
    });

    it("produces identical trees for duplicate mounts (no shared state)", () => {
      const first = render(<SettingsLoading />);
      const firstHtml = first.container.innerHTML;
      first.unmount();

      const second = render(<SettingsLoading />);
      const secondHtml = second.container.innerHTML;

      expect(secondHtml).toBe(firstHtml);
    });

    it("renders two concurrent instances independently without collision", () => {
      const a = render(<SettingsLoading />);
      const b = render(<SettingsLoading />);

      expect(a.container.querySelectorAll('[data-testid="theme-skeleton"]').length).toBe(1);
      expect(b.container.querySelectorAll('[data-testid="theme-skeleton"]').length).toBe(1);
    });

    it("keeps the ARIA contract stable across re-renders", () => {
      const { rerender } = render(<SettingsLoading />);
      const before = screen.getByTestId("settings-loading").outerHTML;
      rerender(<SettingsLoading />);
      const after = screen.getByTestId("settings-loading").outerHTML;

      expect(after).toBe(before);
      expect(screen.getByTestId("settings-loading")).toHaveAttribute("aria-busy", "true");
    });

    it("boundary: minimum pulse count is exactly met at the threshold (>=5)", () => {
      const { container } = render(<SettingsLoading />);
      const count = container.querySelectorAll(".animate-pulse").length;
      expect(count).toBeGreaterThanOrEqual(5);
      expect(Number.isInteger(count)).toBe(true);
    });

    it("rejects a null child contract by rendering its own content (children ignored)", () => {
      // Passing children must not replace the loading shell.
      render(
        <SettingsLoading>
          <div data-testid="injected-child" />
        </SettingsLoading>
      );
      expect(screen.getByTestId("settings-loading")).toBeInTheDocument();
      expect(screen.queryByTestId("injected-child")).not.toBeInTheDocument();
    });
  });
});
