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
 * Additionally covers the validation boundaries defined in this module:
 *  - accepted input (numbers, literal reduced-motion values, custom labels)
 *  - rejected input (wrong types, negative/overflow delays, NaN, Infinity)
 *  - duplicate submissions (concurrent renders produce identical output)
 *  - boundary values (0, MAX_SKELETON_DELAY_MS)
 *
 * NOTE: This file is a Jest test module. It must be parsed by the
 * project's Jest/Babel transform pipeline (which understands JSX/TSX),
 * not by `Node.js --check`. Running `node --check` directly on a `.jsx`
 * file fails with ERR_UNKNOWN_FILE_EXTENSION because Node's built-in
 * syntax checker does not support the `.jsx` extension. Use
 * `npx jest app/settings/loading.test.jsx` (or the repository's configured
 * test script) to validate this file.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import SettingsLoading, {
  MAX_SKELETON_DELAY_MS,
  DEFAULT_SKELETON_DELAY_MS,
  clampSkeletonDelay,
  normaliseReducedMotion,
  getSettingsLoadingState,
} from "./loading";

expect.extend(toHaveNoViolations);

describe("SettingsLoading", () => {
  it("renders without crashing", () => {
    expect(() => render(<SettingsLoading />)).not.toThrow();
  });

  it("renders the page root with data-testid='settings-loading'", () => {
    render(<SettingsLoading />);
    expect(screen.getByTestId("settings-loading")).toBeInDocument();
  });

  it("renders the page root with aria-busy='true'", () => {
    render(<SettingsLoading />);
    expect(screen.getByTestId("settings-loading")).toHaveAttribute("aria-busy", "true");
  });

  it("renders the NavMenuSkeleton header", () => {
    const { container } = render(<SettingsLoading />);
    const header = container.querySelector("header");
    expect(header).toBeInDocument();
  });

  it("renders the ThemeSkeleton component (data-testid='theme-skeleton')", () => {
    render(<SettingsLoading />);
    expect(screen.getByTestId("theme-skeleton")).toBeInTheDocument();
  });

  it("ThemeSkleton inside SettingsLoading has aria-busy='true'", () => {
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
});

describe("clampSkeletonDelay", () => {
  it("accepts a valid numeric delay", () => {
    expect(clampSkeletonDelay(250)).toBe(250);
  });

  it("accepts a numeric string delay", () => {
    expect(clampSkeletonDelay("125")).toBe(125);
  });

  it("floors fractional delays", () => {
    expect(clampSkeletonDelay(12.7)).toBe(12);
  });

  it("clamps negative delays to 0", () => {
    expect(clampSkeletonDelay(-1)).toBe(0);
  });

  it("clamps delays above the maximum", () => {
    expect(clampSkeletonDelay(MAX_SKELETON_DELAY_MS + 1)).toBe(
      MAX_SKELETON_DELAY_MS
    );
  });

  it("accepts the maximum boundary value", () => {
    expect(clampSkeletonDelay(MAX_SKELETON_DELAY_MS)).toBe(
      MAX_SKELETON_DELAY_MS
    );
  });

  it("accepts the zero boundary value", () => {
    expect(clampSkeletonDelay(0)).toBe(0);
  });

  it("rejects NaN and falls back to the default", () => {
    expect(clampSkeletonDelay(NaN)).toBe(
      DEFAULT_SKELETON_DELAY_MS
    );
  });

  it("rejects Infinity and falls back to the default", () => {
    expect(clampSkeletonDelay(Infinity)).toBe(
      DEFAULT_SKELETON_DELAY_MS
    );
  });

  it("rejects non-numeric strings and falls back to the default", () => {
    expect(clampSkeletonDelay("not-a-number")).toBe(
      DEFAULT_SKELETON_DELAY_MS
    );
  });

  it("rejects null, undefined, objects and booleans", () => {
    expect(clampSkeletonDelay(null)).toBe(
      DEFAULT_SKELETON_DELAY_MS
    );
    expect(clampSkeletonDelay(undefined)).toBe(
      DEFAULT_SKELETON_DELAY_MS
    );
    expect(clampSkeletonDelay({})).toBe(
      DEFAULT_SKELETON_DELAY_MS
    );
    expect(clampSkeletonDelay(true)).toBe(
      DEFAULT_SKELETON_DELAY_MS
    );
  });
});

describe("normaliseReducedMotion", () => {
  it("accepts the documented literals", () => {
    expect(normaliseReducedMotion("system")).toBe("system");
    expect(normaliseReducedMotion("reduce")).toBe("reduce");
    expect(normaliseReducedMotion("no-preference")).toBe(
      "no-preference"
    );
  });

  it("normalises case and whitespace", () => {
    expect(normaliseReducedMotion("  REduce  ")).toBe("reduce");
  });

  it("rejects unknown literals and non-strings", () => {
    expect(normaliseReducedMotion("fast")).toBe("system");
    expect(normaliseReducedMotion(null)).toBe("system");
    expect(normaliseReducedMotion(1)).toBe("system");
    expect(normaliseReducedMotion({})).toBe("system");
  });
});

describe("getSettingsLoadingState", () => {
  it("returns safe defaults for an empty object", () => {
    expect(getSettingsLoadingState({})).toEqual({
      delayMic: DEFAULT_SKELETON_DELAY_MS,
      reducedMotion: "system",
      label: "Theme settings loading, please wait",
    });
  });

  it("returns safe defaults for non-object input", () => {
    expect(getSettingsLoadingState(null).delayMic).toBe(
      DEFAULT_SKELETON_DELAY_MS
    );
    expect(getSettingsLoadingState("nope").reducedMotion).toBe("system");
    expect(getSettingsLoadingState(undefined).label).toMatch(/loading/i);
  });

  it("preserves valid input fields", () => {
    expect(
      getSettingsLoadingState({
        delayMic: 1000,
        reducedMotion: "reduce",
        label: "Waiting for settings",
      })
    ).toEqual({
      delayMic: 1000,
      reducedMotion: "reduce",
      label: "Waiting for settings",
    });
  });

  it("is deterministic for duplicate inputs", () => {
    const input = { delayMic: 500, reducedMotion: "reduce", label: "X" };
    expect(getSettingsLoadingState(input)).toEqual(
      getSettingsLoadingState(input)
    );
  });
});

describe("SettingsLoading validation boundaries", () => {
  it("exposes the clamped delay and reduced-motion on the root", () => {
    render(
      <SettingsLoading delayMic={Math.pow(10, 9)} reducedMotion="REDUCE" />
    );
    const root = screen.getByTestId("settings-loading");
    expect(root).toHaveAttribute(
      "data-delay-ms",
      String(MAX_SKELETON_DELAY_MS)
    );
    expect(root).toHaveAttribute("data-reduced-motion", "reduce");
  });

  it("rejects invalid delay and reduced-motion values", () => {
    render(<SettingsLoading delayMic="not-a-number" reducedMotion="fast" />);
    const root = screen.getByTestId("settings-loading");
    expect(root).toHaveAttribute(
      "data-delay-ms",
      String(DEFAULT_SKELETON_DELAY_MS)
    );
    expect(root).toHaveAttribute("data-reduced-motion", "system");
  });

  it("renders identically for duplicate submissions", () => {
    const props = { delayMic: 123, reducedMotion: "system" };
    const first = render(<SettingsLoading {...props} />);
    const firstHtml = first.container.innerHTML;
    first.unrender();
    const second = render(<SettingsLoading {...props} />);
    expect(second.container.innerHTML).toBe(firstHtml);
  });

  it("accepts the zero boundary value", () => {
    render(<SettingsLoading delayMic={0} />);
    expect(screen.getByTestId("settings-loading")).toHaveAttribute(
      "data-delay-ms",
      "0"
    );
  });

  it("accepts the maximum boundary value", () => {
    render(<SettingsLoading delayMic={MAX_SKELETON_DELAY_MS} />);
    expect(screen.getByTestId("settings-loading")).toHaveAttribute(
      "data-delay-ms",
      String(MAX_SKELETON_DELAY_MS)
    );
  });

  it("forwards a custom label to ThemeSkeleton", () => {
    render(<SettingsLoading label="Custom loading message" />);
    expect(screen.getByText(/custom loading message/i)).toBeInDocument();
  });
});
