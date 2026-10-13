import { NextResponse } from "next/server";

import { toAppError } from "./errors";

/**
 * Single response contract for every JSON endpoint (specification section 54).
 *
 *   success: { "success": true,  "data": ... }
 *   failure: { "success": false, "error": { "code": "...", "message": "...", "details": [...] } }
 *
 * Responses are always marked no-store and are never cacheable by a shared cache,
 * because they may contain student-specific data.
 */

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: Array<{ field: string; message: string }>;
}

export interface ApiFailureBody {
  success: false;
  error: ApiErrorPayload;
}

export interface ApiSuccessBody<TData> {
  success: true;
  data: TData;
  meta?: Record<string, unknown>;
}

function baseHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return headers;
}

export function apiSuccess<TData>(
  data: TData,
  options: { status?: number; meta?: Record<string, unknown>; headers?: HeadersInit } = {},
): NextResponse<ApiSuccessBody<TData>> {
  const body: ApiSuccessBody<TData> = { success: true, data };
  if (options.meta) body.meta = options.meta;

  return NextResponse.json(body, {
    status: options.status ?? 200,
    headers: baseHeaders(options.headers),
  });
}

export function apiFailure(
  error: unknown,
  options: { context?: string; headers?: HeadersInit } = {},
): NextResponse<ApiFailureBody> {
  const appError = toAppError(error);

  // Server-side diagnostics only. Student-facing messages stay generic.
  if (appError.status >= 500) {
    console.error(
      `[api] ${options.context ?? "unhandled"} -> ${appError.code}`,
      appError.cause ?? appError.message,
    );
  }

  const headers = baseHeaders(options.headers);
  if (appError.retryAfterSeconds) {
    headers.set("Retry-After", String(appError.retryAfterSeconds));
  }

  return NextResponse.json<ApiFailureBody>(
    {
      success: false,
      error: {
        code: appError.code,
        message: appError.message,
        ...(appError.details && appError.details.length > 0 ? { details: appError.details } : {}),
      },
    },
    { status: appError.status, headers },
  );
}

/**
 * Marks a private file response so intermediaries (and the browser cache) never
 * store student documents such as payment screenshots or resumes.
 */
export function privateFileHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Disposition", "attachment");
  return headers;
}
