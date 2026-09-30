"use client";

/**
 * @file app/invest/MarketplaceShell.jsx
 *
 * Client-boundary wrapper that owns the shared invoice state for all
 * `/invest` routes and provides it via `MarketplaceProvider`.
 *
 * ── Responsibility split ──────────────────────────────────────────────────────
 *
 *  - `app/invest/layout.js` (Server Component) — static structural shell,
 *    no state, no side-effects.
 *  - **This file** (Client Component, `"use client"`) — holds the single
 *    `useState` that drives the invoice list; mounts `MarketplaceProvider`
 *    so both the list page and the detail page share the same invoice array
 *    and can apply/rollback optimistic updates across navigations.
 *
 * ── Why this file exists ──────────────────────────────────────────────────────
 *
 * Next.js App Router requires that `"use client"` boundaries are explicit
 * module boundaries.  Adding `"use client"` directly to `layout.js` would
 * opt every component in that file out of server rendering and prevent RSC
 * streaming.  Extracting the state + context into this thin shell keeps the
 * server layout lean while still satisfying the React Rule that hooks must
 * run inside a client component.
 *
 * ── Concurrent-rendering invariants ──────────────────────────────────────────
 *
 * 1. **useState initialises to null** — `null` is the canonical "not yet
 *    loaded" sentinel.  `MarketplaceProvider` and every consumer treat
 *    `invoices === null` as the loading state.  The initial value is
 *    deterministic across re-renders; React StrictMode double-invoke
 *    produces the same `null` both times.
 *
 * 2. **Children forwarded verbatim** — the shell never inspects or mutates
 *    `children`.  `null`, `undefined`, and any valid React subtree are all
 *    forwarded safely.  This is explicitly tested.
 *
 * 3. **Single setInvoices identity** — `setInvoices` is the stable setter
 *    returned by `useState`.  It is passed by reference to
 *    `MarketplaceProvider`, which memoises it via `useMemo`.  Repeated
 *    renders of this shell do not create new setter instances or trigger
 *    spurious context re-renders.
 *
 * 4. **No side-effects** — the shell performs no fetch, no subscription, and
 *    no storage access.  It is safe to mount, remount, or render multiple
 *    times (e.g. during React Concurrent Mode interruption or StrictMode
 *    double-invoke) without observable side-effects.
 *
 * ── Props ─────────────────────────────────────────────────────────────────────
 *
 * @param {object}           props
 * @param {React.ReactNode}  [props.children] — The page subtree provided by
 *                                              Next.js App Router.  May be
 *                                              `null` or `undefined`; both
 *                                              are forwarded to the provider
 *                                              without error.
 *
 * @returns {React.ReactElement}
 *
 * @see app/invest/layout.js            — server boundary that mounts this shell
 * @see app/invest/MarketplaceContext.jsx — provider + fundInvoice semantics
 */

import { useState } from "react";
import { MarketplaceProvider } from "./MarketplaceContext";

export default function MarketplaceShell({ children }) {
  /**
   * Invoice array shared across the /invest route segment.
   *
   * Initial value is `null` (not yet loaded) — the list page sets this
   * after a successful fetch.  `MarketplaceProvider` propagates updates
   * (including optimistic writes and rollbacks) to all consumers.
   *
   * Invariant: only `setInvoices` may mutate this value; no direct
   * mutation of array elements is permitted.
   */
  const [invoices, setInvoices] = useState(null);

  return (
    <div data-testid="marketplace-shell">
      <MarketplaceProvider invoices={invoices} setInvoices={setInvoices}>
        {children}
      </MarketplaceProvider>
    </div>
  );
}
