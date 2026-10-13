import { AUDIT } from "./config/constants";
import { logger } from "./logger";

/**
 * Monitoring hook.
 *
 * Deliberately SDK-free: error reporting is abstracted so the deployment can switch
 * to Sentry (or any other service) by implementing this one function. When a DSN is
 * configured, errors are posted to the Sentry store endpoint over HTTPS without
 * pulling a large SDK into the client bundle.
 *
 * Privacy: context is passed through the same redaction used by the logger, so OTP
 * codes, tokens and payment credentials can never leave the server.
 */

const SENTRY_DSN = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";

interface ParsedDsn {
  endpoint: string;
  publicKey: string;
}

function parseDsn(dsn: string): ParsedDsn | null {
  try {
    const url = new URL(dsn);
    const segments = url.pathname.split("/").filter(Boolean);
    const projectId = segments.pop();
    if (!projectId) return null;
    return {
      publicKey: url.username,
      endpoint: `${url.protocol}//${url.host}${url.pathname}/api/${projectId}/store/`,
    };
  } catch {
    return null;
  }
}

function sanitiseContext(context: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    const sensitive = AUDIT.redactedKeys.some((item) => key.toLowerCase().includes(item.toLowerCase()));
    result[key] = sensitive ? "[redacted]" : value;
  }
  return result;
}

export function captureException(error: unknown, context: Record<string, unknown> = {}): void {
  const message = error instanceof Error ? error.message : String(error);
  const safeContext = sanitiseContext(context);

  logger.error("[monitoring] exception captured", { message, ...safeContext });

  const sensitive = /browser|client/i.test(String(safeContext.source ?? ""));
  const dsn = sensitive ? (process.env.NEXT_PUBLIC_SENTRY_DSN ?? "") : SENTRY_DSN;
  const parsed = dsn ? parseDsn(dsn) : null;
  if (!parsed) return;

  const payload = {
    timestamp: new Date().toISOString(),
    level: "error",
    platform: "javascript",
    release: process.env.VERCEL_GIT_COMMIT_SHA ?? undefined,
    exception: {
      values: [
        {
          type: error instanceof Error ? error.name : "Error",
          value: message,
          // Stack traces are only included when explicitly provided by the caller.
          stacktrace: undefined,
        },
      ],
    },
    tags: safeContext as Record<string, string>,
  };

  // Fire and forget: monitoring must never break a request or block a response.
  void fetch(parsed.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${parsed.publicKey}, sentry_client=internship-portal/1.0`,
    },
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}
