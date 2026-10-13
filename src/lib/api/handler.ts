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
    try {
      if (options.mutating ?? !["GET", "HEAD", "OPTIONS"].includes(req.method)) assertSameOrigin(req.headers);
      return await handler(req, ctx, meta);
    } catch (error) {
      if (isAppError(error)) {
        const type = error.code === "FORBIDDEN" ? "AUTHORIZATION_FAILURE" : error.code === "CSRF_FAILED" ? "CSRF_FAILURE" : error.code === "RATE_LIMITED" ? "RATE_LIMIT_EXCEEDED" : null;
        if (type) await securityEvent(type, type === "AUTHORIZATION_FAILURE" ? "MEDIUM" : "LOW", { ipAddress: meta.ipAddress, userAgent: meta.userAgent, detail: { path: new URL(req.url).pathname, method: req.method } });
      }
      return apiFailure(error, { context: `${req.method} ${new URL(req.url).pathname}` }) as NextResponse;
    }
  };
}
