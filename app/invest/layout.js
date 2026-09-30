import MarketplaceShell from "./MarketplaceShell";
import { copy } from "@/app/copy/en";
import { reportError } from "@/lib/observability/reportError";
import { validateInvestChildren, validateInvestLayoutParams } from "./validation";

/**
 * Layout for all /invest routes.
 *
 * Validation boundary (#1170)
 * ───────────────────────────
 * This layout is the boundary between the router and every `/invest` view, so
 * it is where untrusted boundary input is validated exactly once:
 *
 *  - `children` must be renderable. React silently renders `null`/`undefined`
 *    /`boolean`, which at a layout boundary becomes a blank, unexplained page,
 *    so those are rejected instead of mounted.
 *  - `params` (segment params, when present) must be string or string[].
 *
 * Invariants:
 *  1. Input is only ever validated here, never repaired/coerced. Invalid input
 *     can therefore never be mounted as if it were valid.
 *  2. A rejection is observable (reported to the sink) and deterministic (a
 *     stable reason), and renders a fixed, accessible fallback rather than
 *     throwing away the whole route with an opaque error.
 *  3. Valid input is forwarded unchanged, so existing callers/routes keep the
 *     exact same shell and behaviour.
 *
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {object} [props.params]
 */
export default function InvestLayout({ children, params }) {
  const childrenResult = validateInvestChildren(children);
  const paramsResult = validateInvestLayoutParams(params);

  if (!childrenResult.ok || !paramsResult.ok) {
    const reason = !childrenResult.ok ? childrenResult.reason : paramsResult.reason;
    reportError(new Error("Invalid invest layout boundary input"), {
      scope: "invest.layout",
      reason,
    });

    return (
      <section
        role="alert"
        aria-live="assertive"
        data-testid="invest-layout-boundary"
        className="min-h-screen bg-slate-950 text-slate-100 px-6 py-12"
      >
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-2">{copy.invest.routeBoundaryTitle}</h1>
          <p className="text-slate-400">{copy.invest.routeBoundaryDescription}</p>
        </div>
      </section>
    );
  }

  return <MarketplaceShell>{children}</MarketplaceShell>;
}
