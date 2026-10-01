/**
 * @file app/invest/layout.js
 * Shared layout for all `/invest` routes (list + detail).
 *
 * ── Architecture ──────────────────────────────────────────────────────────────
 *
 * This file is a **React Server Component** (no `"use client"` directive).
 * It composes the client boundary by rendering `MarketplaceShell`, which
 * carries the `"use client"` directive and owns all shared invoice state.
 *
 *   Server boundary (this file)
 *   └── MarketplaceShell  ← "use client" — owns useState + context
 *       └── MarketplaceProvider
 *           └── {children}  ← list page | detail page (may be RSC or CC)
 *
 * Keeping the layout itself free of `"use client"` ensures the entire
 * subtree can be split cleanly: the server pre-renders the structural shell
 * while client state is initialised only on the browser.
 *
 * ── Concurrent-rendering invariants ──────────────────────────────────────────
 *
 * React 19 (Concurrent Mode) may interrupt, suspend, or replay renders.
 * The following invariants hold regardless of render order or retries:
 *
 * 1. **Stateless shell** — `InvestLayout` carries no state and no side-effects.
 *    Re-rendering it any number of times (including StrictMode double-invoke)
 *    produces identical output with zero observable side-effects.
 *
 * 2. **Children passthrough** — `{children}` is forwarded verbatim to
 *    `MarketplaceShell`.  The layout never inspects, clones, or mutates child
 *    nodes, so any valid React subtree is accepted safely.
 *
 * 3. **Single provider instance** — `MarketplaceShell` (and therefore
 *    `MarketplaceProvider`) is mounted exactly once per route segment
 *    activation.  Concurrent re-renders of this layout do not create
 *    duplicate providers or orphaned context values.
 *
 * 4. **No shared mutable state at this level** — all invoice state, optimistic
 *    updates, and in-flight tracking live inside `MarketplaceShell` /
 *    `useMarketplaceActions`.  A concurrent render of `InvestLayout` cannot
 *    corrupt that state.
 *
 * ── Props ─────────────────────────────────────────────────────────────────────
 *
 * @param {object}           props
 * @param {React.ReactNode}  props.children — Page segment rendered by Next.js
 *                                            App Router (list or detail page).
 *                                            Must be a valid React node; `null`
 *                                            and `undefined` are forwarded safely
 *                                            to the shell.
 *
 * @returns {React.ReactElement}
 *
 * @see app/invest/MarketplaceShell.jsx — client boundary + provider mount
 * @see app/invest/MarketplaceContext.jsx — context shape and fundInvoice semantics
 * @see app/invest/loading.js            — route-level Suspense fallback
 */
import MarketplaceShell from "./MarketplaceShell";
import { copy } from "@/app/copy/en";
import { reportError } from "@/lib/observability/reportError";
import { validateInvestChildren, validateInvestLayoutParams } from "./validation";

export default function InvestLayout({ children }) {
  return <MarketplaceShell>{children}</MarketplaceShell>;
}
