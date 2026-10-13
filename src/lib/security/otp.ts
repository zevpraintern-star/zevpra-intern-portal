import { getEnv } from "../config/env";
import { constantTimeEqual, hmacSha256Hex, randomNumericCode } from "./crypto";

/**
 * Email OTP handling.
 *
 * Guarantees enforced here (specification sections 13 and 14):
 *  - Codes come from a cryptographically secure source.
 *  - Only a keyed HMAC of the code is ever persisted; the database never holds a
 *    usable code and support staff cannot read one.
 *  - The digest is bound to the email address and purpose, so a code issued for
 *    one flow cannot be replayed in another.
 *  - The code is never logged and never returned by an API response.
 */

export type OtpPurpose =
  | "STUDENT_REGISTER"
  | "STUDENT_LOGIN"
  | "ADMIN_LOGIN"
  | "EMAIL_VERIFY"
  | "PASSWORD_RESET";

export interface GeneratedOtp {
  /** Plaintext code - handed to the email service and then discarded. */
  code: string;
  /** Digest persisted in otp_requests.code_hash. */
  codeHash: string;
  expiresAt: Date;
}

function otpPepper(): string {
  const env = getEnv();
  // Falls back to the session secret so a missing pepper cannot silently weaken
  // the digest to an unkeyed hash.
  return env.OTP_HASH_PEPPER ?? env.SESSION_SECRET;
}

export function hashOtpCode(code: string, email: string, purpose: OtpPurpose): string {
  const normalisedEmail = email.trim().toLowerCase();
  return hmacSha256Hex(otpPepper(), `${purpose}:${normalisedEmail}:${code}`);
}

export function generateOtp(email: string, purpose: OtpPurpose, now: Date = new Date()): GeneratedOtp {
  const env = getEnv();
  const code = randomNumericCode(env.OTP_LENGTH);
  const expiresAt = new Date(now.getTime() + env.OTP_TTL_MINUTES * 60 * 1000);
  return { code, codeHash: hashOtpCode(code, email, purpose), expiresAt };
}

/** Constant-time verification of a submitted code against the stored digest. */
export function verifyOtpCode(
  submittedCode: string,
  storedHash: string,
  email: string,
  purpose: OtpPurpose,
): boolean {
  const candidate = hashOtpCode(submittedCode.replace(/\s+/g, ""), email, purpose);
  return constantTimeEqual(candidate, storedHash);
}

export interface OtpRequestState {
  attempts: number;
  maxAttempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export type OtpValidity =
  | { valid: true }
  | { valid: false; reason: "consumed" | "expired" | "attempts_exceeded" | "superseded" };

/**
 * Evaluates an OTP row without leaking which specific check failed to the caller:
 * route handlers always return the same generic message.
 */
export function evaluateOtpRequest(
  state: OtpRequestState,
  now: Date = new Date(),
): OtpValidity {
  if (state.consumedAt) return { valid: false, reason: "consumed" };
  if (state.expiresAt.getTime() <= now.getTime()) return { valid: false, reason: "expired" };
  if (state.attempts >= state.maxAttempts) return { valid: false, reason: "attempts_exceeded" };
  return { valid: true };
}

/** Resend policy: cooldown between requests plus an hourly ceiling. */
export function canResendOtp(
  state: Pick<OtpRequestState, "createdAt"> & { resendCount: number },
  now: Date = new Date(),
): { allowed: boolean; retryAfterSeconds: number } {
  const env = getEnv();
  const cooldownEndsAt = state.createdAt.getTime() + env.OTP_RESEND_COOLDOWN_SECONDS * 1000;
  if (now.getTime() < cooldownEndsAt) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((cooldownEndsAt - now.getTime()) / 1000),
    };
  }
  if (state.resendCount >= env.OTP_MAX_RESENDS_PER_HOUR) {
    return { allowed: false, retryAfterSeconds: 3600 };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Masks an address for UI copy, e.g. "ma***@example.com". */
export function maskEmail(email: string): string {
  const [localPart = "", domain = ""] = email.split("@");
  if (!localPart || !domain) return "your email";
  const visible = localPart.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(2, localPart.length - 2))}@${domain}`;
}
