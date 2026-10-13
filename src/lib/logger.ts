import { AUDIT } from "./config/constants";
import { getEnv } from "./config/env";

/**
 * Minimal structured logger.
 *
 * Security rules baked in here:
 *  - Values under sensitive keys (OTP codes, tokens, passwords, secrets) are
 *    replaced with "[redacted]" before anything is written.
 *  - OTP values, session tokens and payment credentials are never logged, not even
 *    at debug level.
 *  - Errors are serialised without stack traces in production output.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const REDACTED = "[redacted]";

function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}...[truncated]` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redactValue(item, depth + 1));
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const isSensitive = AUDIT.redactedKeys.some((sensitive: string) =>
        key.toLowerCase().includes(sensitive.toLowerCase()),
      );
      result[key] = isSensitive ? REDACTED : redactValue(nested, depth + 1);
    }
    return result;
  }
  return String(value);
}

function shouldLog(level: LogLevel): boolean {
  let minimum: LogLevel = "info";
  try {
    minimum = getEnv().LOG_LEVEL;
  } catch {
    // Environment not ready (build-time import): default to warn to stay quiet.
    minimum = "warn";
  }
  return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[minimum];
}

function write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;

  const payload = {
    level,
    time: new Date().toISOString(),
    message,
    ...(context ? { context: redactValue(context) } : {}),
  };

  const serialised = JSON.stringify(payload);
  if (level === "error") {
    console.error(serialised);
  } else if (level === "warn") {
    console.warn(serialised);
  } else {
    console.info(serialised);
  }
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => write("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) => write("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => write("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => write("error", message, context),
};

/** Exported for tests so redaction behaviour can be asserted directly. */
export const __testing = { redactValue };
