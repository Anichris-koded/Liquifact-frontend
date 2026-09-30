"use client";

import { useEffect } from "react";
import ErrorBanner from "@/components/ErrorBanner";
import { copy } from "@/app/copy/en";
import { reportError } from "@/lib/observability/reportError";

export default function InvoiceDetailError({ error, reset }) {
  useEffect(() => {
    // Forward to the pluggable observability sink so failures are diagnosable
    // in production. `digest` is the opaque server-side correlation id; the raw
    // `error.message` is intentionally NOT rendered because it may contain
    // internal or sensitive detail.
    reportError(error, {
      scope: "invest.invoice_detail",
      digest: error?.digest,
    });
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <main className="max-w-4xl mx-auto py-12" id="main-content">
        <ErrorBanner
          variant="server"
          title={copy.error?.title || "Something went wrong"}
          description={copy.error?.description}
          actionLabel={copy.error?.actionLabel}
          onAction={reset}
        />
      </main>
    </div>
  );
}
