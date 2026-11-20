import { NextRequest, NextResponse } from "next/server";

import { isAppError } from "@/lib/api/errors";
import { assertSameOrigin, requestMeta } from "@/lib/api/request";
import { apiFailure } from "@/lib/api/response";
import { securityEvent } from "@/server/services/audit";

type Handler<Ctx> = (req: NextRequest, ctx: Ctx, meta: ReturnType<typeof requestMeta>) => Promise<Response>;

/**
 * Wraps a route handler with the cross-cutting rules: same-origin check on mutating
 * methods, uniform error envelope (no stack traces), and security-event capture for
 * authorisation failures, CSRF failures and rate-limit hits.
 */
export function route<Ctx = unknown>(handler: Handler<Ctx>, options: { mutating?: boolean } = {}) {
  return async (req: NextRequest, ctx: Ctx): Promise<Response> => {
    const meta = requestMeta(req.headers);
    const path = new URL(req.url).pathname;
    const authAttempt = path.startsWith("/api/auth/") && req.method !== "GET";
    let authEmail: string | undefined;
    if (authAttempt) {
      try {
        const body = await req.clone().json() as { email?: unknown };
        if (typeof body.email === "string") authEmail = body.email.trim().toLowerCase().slice(0, 255);
      } catch {
        // Malformed request bodies still get recorded without guessing an identity.
      }
    }
    try {
      if (options.mutating ?? !["GET", "HEAD", "OPTIONS"].includes(req.method)) assertSameOrigin(req.headers);
      const response = await handler(req, ctx, meta);
      if (authAttempt) await securityEvent("AUTHENTICATION_ATTEMPT", response.ok ? "LOW" : "MEDIUM", {
        email: authEmail,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        detail: { path, method: req.method, outcome: response.ok ? "success" : "failure", status: response.status },
      });
      return response;
    } catch (error) {
      if (authAttempt) await securityEvent("AUTHENTICATION_ATTEMPT", "MEDIUM", {
        email: authEmail,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        detail: { path, method: req.method, outcome: "failure", reason: isAppError(error) ? error.code : "unexpected_error" },
      });
      if (isAppError(error)) {
        const type = error.code === "FORBIDDEN" ? "AUTHORIZATION_FAILURE" : error.code === "CSRF_FAILED" ? "CSRF_FAILURE" : error.code === "RATE_LIMITED" ? "RATE_LIMIT_EXCEEDED" : null;
        if (type) await securityEvent(type, type === "AUTHORIZATION_FAILURE" ? "MEDIUM" : "LOW", { ipAddress: meta.ipAddress, userAgent: meta.userAgent, detail: { path: new URL(req.url).pathname, method: req.method } });
      }
      return apiFailure(error, { context: `${req.method} ${new URL(req.url).pathname}` }) as NextResponse;
    }
  };
}
