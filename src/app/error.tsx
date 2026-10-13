"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { captureException } from "@/lib/monitoring";

/**
 * Route-level error boundary (500).
 *
 * The digest is shown instead of an error message so internal details, stack traces
 * and database errors never reach a student's browser. The full error is reported to
 * the monitoring pipeline (Sentry is wired in Phase 10).
 */
export default function GlobalRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureException(error, { source: "route-error-boundary", digest: error.digest });
  }, [error]);

  return (
    <div className="container-page flex min-h-dvh flex-col items-center justify-center gap-6 py-20 text-center">
      <p className="font-mono text-sm text-muted-foreground">500</p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Something went wrong</h1>
      <p className="max-w-md text-muted-foreground">
        We could not complete that request. Please try again. If the problem continues, contact
        support and mention the reference below.
      </p>

      {error.digest ? (
        <p className="font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>
      ) : null}

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
