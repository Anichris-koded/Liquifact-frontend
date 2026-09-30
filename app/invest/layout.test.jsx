/**
 * Boundary tests for app/invest/layout.js (#1170).
 *
 * Verifies:
 *  - valid children/params mount the marketplace shell unchanged
 *  - invalid boundary input renders a deterministic, accessible fallback
 *  - rejections are reported to the observability sink with a stable reason
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import InvestLayout from "./layout";
import { copy } from "@/app/copy/en";
import { setReporter, resetReporter } from "@/lib/observability/reportError";
import { VALIDATION_REASONS } from "./validation";

jest.mock("./MarketplaceShell", () => ({
  __esModule: true,
  default: function MockMarketplaceShell({ children }) {
    return <div data-testid="marketplace-shell">{children}</div>;
  },
}));

describe("InvestLayout validation boundary", () => {
  let reporter;

  beforeEach(() => {
    reporter = jest.fn();
    setReporter(reporter);
  });

  afterEach(() => {
    resetReporter();
  });

  it("mounts the marketplace shell for valid children and params", () => {
    render(
      <InvestLayout params={{}}>
        <p>marketplace body</p>
      </InvestLayout>
    );

    expect(screen.getByTestId("marketplace-shell")).toBeInTheDocument();
    expect(screen.getByText("marketplace body")).toBeInTheDocument();
    expect(screen.queryByTestId("invest-layout-boundary")).not.toBeInTheDocument();
    expect(reporter).not.toHaveBeenCalled();
  });

  it("accepts a missing params object (no dynamic ancestor)", () => {
    render(
      <InvestLayout>
        <p>marketplace body</p>
      </InvestLayout>
    );

    expect(screen.getByTestId("marketplace-shell")).toBeInTheDocument();
    expect(reporter).not.toHaveBeenCalled();
  });

  it("renders the deterministic fallback and reports null children", () => {
    render(<InvestLayout>{null}</InvestLayout>);

    const boundary = screen.getByTestId("invest-layout-boundary");
    expect(boundary).toHaveAttribute("role", "alert");
    expect(
      screen.getByRole("heading", { level: 1, name: copy.invest.routeBoundaryTitle })
    ).toBeInTheDocument();
    expect(screen.getByText(copy.invest.routeBoundaryDescription)).toBeInTheDocument();
    expect(screen.queryByTestId("marketplace-shell")).not.toBeInTheDocument();

    expect(reporter).toHaveBeenCalledTimes(1);
    expect(reporter.mock.calls[0][1]).toMatchObject({
      scope: "invest.layout",
      reason: VALIDATION_REASONS.INVALID_CHILDREN,
    });
  });

  it("renders the fallback and reports invalid params values", () => {
    render(
      <InvestLayout params={{ id: 42 }}>
        <p>marketplace body</p>
      </InvestLayout>
    );

    expect(screen.getByTestId("invest-layout-boundary")).toBeInTheDocument();
    expect(reporter).toHaveBeenCalledTimes(1);
    expect(reporter.mock.calls[0][1]).toMatchObject({
      scope: "invest.layout",
      reason: VALIDATION_REASONS.INVALID_PARAMS,
    });
  });

  it("does not leak the rejected value into the reported context", () => {
    render(
      <InvestLayout params={{ token: { nested: "super-secret" } }}>
        <p>marketplace body</p>
      </InvestLayout>
    );

    const context = reporter.mock.calls[0][1];
    expect(JSON.stringify(context)).not.toContain("super-secret");
  });
});
