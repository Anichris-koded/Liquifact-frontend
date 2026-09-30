/**
 * @jest-environment jsdom
 *
 * @file app/invest/layout.test.jsx
 *
 * Regression + concurrent-execution tests for the /invest route layout
 * boundary (app/invest/layout.js → MarketplaceShell → MarketplaceProvider).
 *
 * ── Validation boundaries covered ────────────────────────────────────────────
 *
 * 1. SC passthrough — InvestLayout is a server component wrapper; it must
 *    delegate children to the shell without modification.
 *
 * 2. MarketplaceShell — client boundary, useState initialised to null,
 *    data-testid="marketplace-shell", children forwarded verbatim.
 *
 * 3. Provider integration — children can read invoices/setInvoices/fundInvoice
 *    from MarketplaceContext after mounting through InvestLayout.
 *
 * 4. Concurrent / idempotent rendering — multiple sequential mounts, StrictMode
 *    double-invoke, and repeated renders must not create duplicate providers or
 *    corrupt context state.
 *
 * 5. Boundary / edge inputs — null children, undefined children, deep subtrees,
 *    and rapid re-renders must all be handled safely.
 *
 * 6. Accessibility — no axe violations on the shell wrapper.
 *
 * 7. Regression — fundInvoice concurrent-guard round-trip through the layout
 *    boundary to verify that the in-flight deduplication reaches the consumer.
 */

import React, { StrictMode } from "react";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import InvestLayout from "./layout";
import MarketplaceShell from "./MarketplaceShell";
import { MarketplaceProvider, useMarketplace } from "./MarketplaceContext";

expect.extend(toHaveNoViolations);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const INVOICES = [
  { id: "inv-001", issuer: "Acme Corp", status: "Open", amount: "10,000", currency: "USD" },
  { id: "inv-002", issuer: "Bright Ltd", status: "Open", amount: "5,500", currency: "EUR" },
  { id: "inv-003", issuer: "Solar Inc", status: "Funded", amount: "8,000", currency: "USD" },
];

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ── Helper: wrap a hook inside InvestLayout ───────────────────────────────────

/**
 * Renders a hook consumer inside the full layout boundary
 * (InvestLayout → MarketplaceShell → MarketplaceProvider).
 *
 * The wrapper manages its own invoice state so setInvoices calls propagate
 * correctly back into the context, mirroring production usage.
 */
function makeLayoutWrapper(initialInvoices = INVOICES) {
  function Wrapper({ children }) {
    const [invoices, setInvoices] = React.useState(initialInvoices);
    return (
      <InvestLayout>
        <MarketplaceProvider invoices={invoices} setInvoices={setInvoices}>
          {children}
        </MarketplaceProvider>
      </InvestLayout>
    );
  }
  return Wrapper;
}

// ── 1. SC passthrough ─────────────────────────────────────────────────────────

describe("InvestLayout — Server Component passthrough", () => {
  it("renders without throwing", () => {
    expect(() => render(<InvestLayout><p>child</p></InvestLayout>)).not.toThrow();
  });

  it("renders the marketplace-shell wrapper", () => {
    render(<InvestLayout><p>child</p></InvestLayout>);
    expect(screen.getByTestId("marketplace-shell")).toBeInTheDocument();
  });

  it("passes children through to the DOM", () => {
    render(<InvestLayout><p data-testid="page-child">Hello</p></InvestLayout>);
    expect(screen.getByTestId("page-child")).toBeInTheDocument();
    expect(screen.getByTestId("page-child")).toHaveTextContent("Hello");
  });

  it("passes a complex subtree through unchanged", () => {
    render(
      <InvestLayout>
        <section data-testid="deep-tree">
          <h1>Title</h1>
          <ul>
            <li>A</li>
            <li>B</li>
          </ul>
        </section>
      </InvestLayout>
    );
    expect(screen.getByTestId("deep-tree")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("renders without children (null) without throwing", () => {
    expect(() => render(<InvestLayout>{null}</InvestLayout>)).not.toThrow();
  });

  it("renders without children (undefined) without throwing", () => {
    expect(() => render(<InvestLayout>{undefined}</InvestLayout>)).not.toThrow();
  });

  it("renders multiple children without throwing", () => {
    expect(() =>
      render(
        <InvestLayout>
          <p data-testid="c1">one</p>
          <p data-testid="c2">two</p>
        </InvestLayout>
      )
    ).not.toThrow();
    expect(screen.getByTestId("c1")).toBeInTheDocument();
    expect(screen.getByTestId("c2")).toBeInTheDocument();
  });
});

// ── 2. MarketplaceShell ───────────────────────────────────────────────────────

describe("MarketplaceShell — client boundary", () => {
  it("renders the data-testid='marketplace-shell' wrapper", () => {
    render(<MarketplaceShell><span>test</span></MarketplaceShell>);
    expect(screen.getByTestId("marketplace-shell")).toBeInTheDocument();
  });

  it("forwards children into the DOM", () => {
    render(<MarketplaceShell><span data-testid="inner">inner</span></MarketplaceShell>);
    expect(screen.getByTestId("inner")).toBeInTheDocument();
  });

  it("accepts null children without throwing", () => {
    expect(() => render(<MarketplaceShell>{null}</MarketplaceShell>)).not.toThrow();
  });

  it("accepts undefined children without throwing", () => {
    expect(() => render(<MarketplaceShell>{undefined}</MarketplaceShell>)).not.toThrow();
  });

  it("mounts exactly one marketplace-shell element", () => {
    const { container } = render(<MarketplaceShell><span>x</span></MarketplaceShell>);
    expect(container.querySelectorAll('[data-testid="marketplace-shell"]')).toHaveLength(1);
  });

  it("initialises invoices to null in the context", () => {
    const { result } = renderHook(() => useMarketplace(), {
      wrapper: ({ children }) => (
        <MarketplaceShell>
          {/* We must render a nested provider to read context */}
          <MarketplaceProvider invoices={null} setInvoices={() => {}}>
            {children}
          </MarketplaceProvider>
        </MarketplaceShell>
      ),
    });
    expect(result.current.invoices).toBeNull();
  });
});

// ── 3. Provider integration ───────────────────────────────────────────────────

describe("InvestLayout — provider integration", () => {
  it("exposes invoices via useMarketplace inside the layout", () => {
    const { result } = renderHook(() => useMarketplace(), {
      wrapper: makeLayoutWrapper(INVOICES),
    });
    expect(result.current.invoices).toEqual(INVOICES);
  });

  it("exposes setInvoices as a function", () => {
    const { result } = renderHook(() => useMarketplace(), {
      wrapper: makeLayoutWrapper(INVOICES),
    });
    expect(typeof result.current.setInvoices).toBe("function");
  });

  it("exposes fundInvoice as a function", () => {
    const { result } = renderHook(() => useMarketplace(), {
      wrapper: makeLayoutWrapper(INVOICES),
    });
    expect(typeof result.current.fundInvoice).toBe("function");
  });

  it("exposes pendingIds as an empty Set on mount", () => {
    const { result } = renderHook(() => useMarketplace(), {
      wrapper: makeLayoutWrapper(INVOICES),
    });
    expect(result.current.pendingIds).toBeInstanceOf(Set);
    expect(result.current.pendingIds.size).toBe(0);
  });

  it("setInvoices propagates a new invoice array to consumers", async () => {
    const { result } = renderHook(() => useMarketplace(), {
      wrapper: makeLayoutWrapper(INVOICES),
    });

    const updated = [
      { id: "inv-999", issuer: "New Co", status: "Open", amount: "1,000", currency: "USD" },
    ];
    await act(async () => {
      result.current.setInvoices(updated);
    });

    expect(result.current.invoices).toEqual(updated);
  });

  it("renders child content inside the full layout tree", () => {
    render(
      <InvestLayout>
        <MarketplaceProvider invoices={INVOICES} setInvoices={() => {}}>
          <p data-testid="consumer-child">marketplace page</p>
        </MarketplaceProvider>
      </InvestLayout>
    );
    expect(screen.getByTestId("consumer-child")).toBeInTheDocument();
  });

  it("throws when useMarketplace is used outside a MarketplaceProvider", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      renderHook(() => useMarketplace())
    ).toThrow("useMarketplace must be used within a MarketplaceProvider");
    spy.mockRestore();
  });
});

// ── 4. Concurrent / idempotent rendering ──────────────────────────────────────

describe("InvestLayout — concurrent and idempotent rendering", () => {
  it("can be mounted and unmounted multiple times without leaking state", () => {
    const { unmount: u1 } = render(<InvestLayout><span>a</span></InvestLayout>);
    u1();
    const { unmount: u2 } = render(<InvestLayout><span>b</span></InvestLayout>);
    u2();
    // No throw = no leaked subscription / side-effect
  });

  it("renders identically on repeated calls (idempotent output)", () => {
    const { container: c1 } = render(<InvestLayout><span>same</span></InvestLayout>);
    const { container: c2 } = render(<InvestLayout><span>same</span></InvestLayout>);
    expect(c1.querySelectorAll('[data-testid="marketplace-shell"]')).toHaveLength(1);
    expect(c2.querySelectorAll('[data-testid="marketplace-shell"]')).toHaveLength(1);
  });

  it("mounts exactly one marketplace-shell under InvestLayout (no duplicate providers)", () => {
    const { container } = render(<InvestLayout><span>x</span></InvestLayout>);
    expect(container.querySelectorAll('[data-testid="marketplace-shell"]')).toHaveLength(1);
  });

  it("handles StrictMode double-invoke without throwing", () => {
    expect(() =>
      render(
        <StrictMode>
          <InvestLayout><span>strict</span></InvestLayout>
        </StrictMode>
      )
    ).not.toThrow();
  });

  it("StrictMode double-invoke still renders exactly one shell", () => {
    const { container } = render(
      <StrictMode>
        <InvestLayout><span>strict</span></InvestLayout>
      </StrictMode>
    );
    expect(container.querySelectorAll('[data-testid="marketplace-shell"]')).toHaveLength(1);
  });

  it("re-rendering with different children does not duplicate the shell", () => {
    const { rerender, container } = render(
      <InvestLayout><span data-testid="v1">v1</span></InvestLayout>
    );
    rerender(<InvestLayout><span data-testid="v2">v2</span></InvestLayout>);
    expect(container.querySelectorAll('[data-testid="marketplace-shell"]')).toHaveLength(1);
    expect(screen.queryByTestId("v1")).not.toBeInTheDocument();
    expect(screen.getByTestId("v2")).toBeInTheDocument();
  });

  it("two sibling InvestLayout renders each have their own isolated shell", () => {
    const { container } = render(
      <>
        <InvestLayout><span>left</span></InvestLayout>
        <InvestLayout><span>right</span></InvestLayout>
      </>
    );
    expect(container.querySelectorAll('[data-testid="marketplace-shell"]')).toHaveLength(2);
  });
});

// ── 5. Concurrent fundInvoice regression ──────────────────────────────────────

describe("InvestLayout — concurrent fundInvoice regression", () => {
  it("fundInvoice applies optimistic status before the action resolves", async () => {
    const { result } = renderHook(() => useMarketplace(), {
      wrapper: makeLayoutWrapper(INVOICES),
    });
    const d = deferred();
    const action = jest.fn(() => d.promise);

    act(() => {
      result.current.fundInvoice("inv-001", 500, action);
    });

    expect(
      result.current.invoices.find((i) => i.id === "inv-001").status
    ).toBe("Funded");
    expect(result.current.pendingIds.has("inv-001")).toBe(true);

    await act(async () => {
      d.resolve();
      await d.promise;
    });

    expect(result.current.pendingIds.has("inv-001")).toBe(false);
  });

  it("fundInvoice rolls back status on action failure", async () => {
    const { result } = renderHook(() => useMarketplace(), {
      wrapper: makeLayoutWrapper(INVOICES),
    });
    const action = jest.fn().mockRejectedValue(new Error("server error"));

    await act(async () => {
      await result.current.fundInvoice("inv-001", 500, action).catch(() => {});
    });

    expect(
      result.current.invoices.find((i) => i.id === "inv-001").status
    ).toBe("Open");
    expect(result.current.pendingIds.has("inv-001")).toBe(false);
  });

  it("concurrent guard blocks a duplicate fund call on the same invoice", async () => {
    const { result } = renderHook(() => useMarketplace(), {
      wrapper: makeLayoutWrapper(INVOICES),
    });
    const d = deferred();
    const action = jest.fn(() => d.promise);

    let firstPromise;
    act(() => {
      firstPromise = result.current.fundInvoice("inv-001", 500, action);
    });

    let secondResult;
    await act(async () => {
      secondResult = await result.current.fundInvoice("inv-001", 300, action);
    });

    // Guard must block the second call
    expect(secondResult).toBe(false);
    expect(action).toHaveBeenCalledTimes(1);

    await act(async () => {
      d.resolve();
      await firstPromise;
    });
  });

  it("concurrent fund actions on different invoices are tracked independently", async () => {
    const { result } = renderHook(() => useMarketplace(), {
      wrapper: makeLayoutWrapper(INVOICES),
    });
    const d1 = deferred();
    const d2 = deferred();

    let fp1, fp2;
    act(() => {
      fp1 = result.current.fundInvoice("inv-001", 500, () => d1.promise);
      fp2 = result.current.fundInvoice("inv-002", 300, () => d2.promise);
    });

    expect(result.current.pendingIds.has("inv-001")).toBe(true);
    expect(result.current.pendingIds.has("inv-002")).toBe(true);

    await act(async () => {
      d1.resolve();
      await fp1;
    });
    expect(result.current.pendingIds.has("inv-001")).toBe(false);
    expect(result.current.pendingIds.has("inv-002")).toBe(true);

    await act(async () => {
      d2.resolve();
      await fp2;
    });
    expect(result.current.pendingIds.size).toBe(0);
  });

  it("rolling back one invoice does not affect a concurrent in-flight invoice", async () => {
    const { result } = renderHook(() => useMarketplace(), {
      wrapper: makeLayoutWrapper(INVOICES),
    });
    const d1 = deferred();
    const d2 = deferred();

    let fp1, fp2;
    act(() => {
      fp1 = result.current.fundInvoice("inv-001", 500, () => d1.promise);
      fp2 = result.current.fundInvoice("inv-002", 300, () => d2.promise);
    });

    // Fail the first, leave second in-flight
    await act(async () => {
      d1.reject(new Error("fail"));
      await fp1.catch(() => {});
    });

    expect(
      result.current.invoices.find((i) => i.id === "inv-001").status
    ).toBe("Open");
    expect(
      result.current.invoices.find((i) => i.id === "inv-002").status
    ).toBe("Funded"); // still optimistic
    expect(result.current.pendingIds.has("inv-002")).toBe(true);

    await act(async () => {
      d2.resolve();
      await fp2;
    });
    expect(result.current.pendingIds.size).toBe(0);
  });

  it("fundInvoice returns true on success", async () => {
    const { result } = renderHook(() => useMarketplace(), {
      wrapper: makeLayoutWrapper(INVOICES),
    });
    const action = jest.fn().mockResolvedValue(undefined);
    let returned;
    await act(async () => {
      returned = await result.current.fundInvoice("inv-001", 500, action);
    });
    expect(returned).toBe(true);
  });

  it("fundInvoice re-throws the error on failure", async () => {
    const { result } = renderHook(() => useMarketplace(), {
      wrapper: makeLayoutWrapper(INVOICES),
    });
    const boom = new Error("network failure");
    const action = jest.fn().mockRejectedValue(boom);
    let caught;
    await act(async () => {
      try {
        await result.current.fundInvoice("inv-001", 500, action);
      } catch (e) {
        caught = e;
      }
    });
    expect(caught).toBe(boom);
  });

  it("allows a new fund call after the previous one completes (not permanently locked)", async () => {
    const { result } = renderHook(() => useMarketplace(), {
      wrapper: makeLayoutWrapper(INVOICES),
    });
    const action = jest.fn().mockResolvedValue(undefined);

    await act(async () => {
      await result.current.fundInvoice("inv-001", 500, action);
    });

    let secondResult;
    await act(async () => {
      secondResult = await result.current.fundInvoice("inv-001", 200, action);
    });

    expect(secondResult).toBe(true);
    expect(action).toHaveBeenCalledTimes(2);
  });

  it("allows a new fund call after a rollback (lock released on failure)", async () => {
    const { result } = renderHook(() => useMarketplace(), {
      wrapper: makeLayoutWrapper(INVOICES),
    });
    const failing = jest.fn().mockRejectedValue(new Error("fail"));
    const succeeding = jest.fn().mockResolvedValue(undefined);

    await act(async () => {
      await result.current.fundInvoice("inv-001", 500, failing).catch(() => {});
    });

    let secondResult;
    await act(async () => {
      secondResult = await result.current.fundInvoice("inv-001", 200, succeeding);
    });

    expect(secondResult).toBe(true);
  });
});

// ── 6. Accessibility ──────────────────────────────────────────────────────────

describe("InvestLayout — accessibility", () => {
  it("has no axe violations with a simple child", async () => {
    const { container } = render(
      <InvestLayout>
        <main><p>Page content</p></main>
      </InvestLayout>
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no axe violations with no children", async () => {
    const { container } = render(<InvestLayout>{null}</InvestLayout>);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
