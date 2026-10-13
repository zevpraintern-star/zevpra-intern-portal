import { ZodError } from "zod";

/**
 * Typed application errors.
 *
 * Route handlers translate these into the single API error envelope described in
 * docs/API.md. Stack traces and driver/database messages never reach a client:
 * anything that is not an AppError is reported as INTERNAL_ERROR.
 */

export type ApiErrorCode =
  | "INVALID_REQUEST"
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "CSRF_FAILED"
  | "INTERNAL_ERROR";

export interface FieldError {
  field: string;
  message: string;
}

export interface AppErrorOptions {
  code: ApiErrorCode;
  message: string;
  status: number;
  details?: FieldError[];
  /** Seconds to wait before retrying (used by 429 responses). */
  retryAfterSeconds?: number;
  /** Original error, kept for server-side logging only. */
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: FieldError[];
  readonly retryAfterSeconds?: number;

  constructor(options: AppErrorOptions) {
    super(options.message, options.cause ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.code = options.code;
    this.status = options.status;
    this.details = options.details;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Please check your input.", details?: FieldError[]) {
    super({ code: "VALIDATION_FAILED", message, status: 400, details });
    this.name = "ValidationError";
  }
}

export class InvalidRequestError extends AppError {
  constructor(message = "The request could not be processed.") {
    super({ code: "INVALID_REQUEST", message, status: 400 });
    this.name = "InvalidRequestError";
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "Please sign in to continue.") {
    super({ code: "UNAUTHENTICATED", message, status: 401 });
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You are not allowed to perform this action.") {
    super({ code: "FORBIDDEN", message, status: 403 });
    this.name = "ForbiddenError";
  }
}

/**
 * Ownership failures (IDOR/BOLA) deliberately reuse NOT_FOUND semantics so an
 * attacker cannot distinguish "exists but not yours" from "does not exist".
 */
export class NotFoundError extends AppError {
  constructor(message = "The requested resource was not found.") {
    super({ code: "NOT_FOUND", message, status: 404 });
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message = "This action conflicts with an existing record.") {
    super({ code: "CONFLICT", message, status: 409 });
    this.name = "ConflictError";
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests. Please try again later.", retryAfterSeconds = 60) {
    super({ code: "RATE_LIMITED", message, status: 429, retryAfterSeconds });
    this.name = "RateLimitError";
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = "The uploaded file is too large.") {
    super({ code: "PAYLOAD_TOO_LARGE", message, status: 413 });
    this.name = "PayloadTooLargeError";
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor(message = "This file type is not allowed.") {
    super({ code: "UNSUPPORTED_MEDIA_TYPE", message, status: 415 });
    this.name = "UnsupportedMediaTypeError";
  }
}

export class CsrfError extends AppError {
  constructor(message = "Your session expired or the request could not be verified. Please reload the page.") {
    super({ code: "CSRF_FAILED", message, status: 403 });
    this.name = "CsrfError";
  }
}

export class InternalError extends AppError {
  constructor(message = "Something went wrong. Please try again.", cause?: unknown) {
    super({ code: "INTERNAL_ERROR", message, status: 500, cause });
    this.name = "InternalError";
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function fieldErrorsFromZod(error: ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    field: issue.path.join(".") || "(root)",
    message: issue.message,
  }));
}

/** Normalises any thrown value into an AppError. */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;
  if (error instanceof ZodError) {
    return new ValidationError("Please check your input.", fieldErrorsFromZod(error));
  }
  return new InternalError("Something went wrong. Please try again.", error);
}
