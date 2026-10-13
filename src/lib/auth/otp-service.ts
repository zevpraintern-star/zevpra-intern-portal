import { getEnv } from "@/lib/config/env";
import { getPrisma } from "@/lib/db/prisma";
import { sendEmailNow } from "@/lib/email/email-service";
import { logger } from "@/lib/logger";
import { consumeRateLimit } from "@/lib/redis/rate-limit";
import {
  evaluateOtpRequest,
  generateOtp,
  verifyOtpCode,
  type OtpPurpose,
} from "@/lib/security/otp";
import { RateLimitError, ValidationError } from "@/lib/api/errors";
import { fingerprintPayload } from "@/lib/security/crypto";

export interface RequestOtpParams {
  email: string;
  purpose: OtpPurpose;
  ipAddress?: string;
  userAgent?: string;
  payloadToBind?: Record<string, unknown>;
}

export interface VerifyOtpParams {
  email: string;
  code: string;
  purpose: OtpPurpose;
  ipAddress?: string;
}

/**
 * Requests an OTP: enforces rate limits, stores the HMAC digest, and dispatches the email.
 */
export async function requestOtp(params: RequestOtpParams): Promise<{ success: boolean; maskedEmail: string }> {
  const env = getEnv();
  const normalisedEmail = params.email.trim().toLowerCase();

  // 1. Rate limiting by email
  const emailLimit = await consumeRateLimit({
    name: "otp-request-email",
    limit: env.RL_OTP_REQUEST_LIMIT,
    windowSeconds: env.RL_OTP_REQUEST_WINDOW_MINUTES * 60,
    identifier: normalisedEmail,
  });

  if (!emailLimit.allowed) {
    throw new RateLimitError(
      "Too many OTP requests for this email. Please try again later.",
      emailLimit.retryAfterSeconds,
    );
  }

  // Rate limiting by IP if present
  if (params.ipAddress) {
    const ipLimit = await consumeRateLimit({
      name: "otp-request-ip",
      limit: env.RL_OTP_REQUEST_LIMIT * 3,
      windowSeconds: env.RL_OTP_REQUEST_WINDOW_MINUTES * 60,
      identifier: params.ipAddress,
    });
    if (!ipLimit.allowed) {
      throw new RateLimitError(
        "Too many OTP requests from this network. Please try again later.",
        ipLimit.retryAfterSeconds,
      );
    }
  }

  // 2. Generate OTP
  const generated = generateOtp(normalisedEmail, params.purpose);
  let payloadHash: string | undefined;
  if (params.payloadToBind) {
    payloadHash = fingerprintPayload(env.SESSION_SECRET, params.payloadToBind);
  }

  // 3. Find if user exists to link userId
  const existingUser = await getPrisma().user.findUnique({
    where: { email: normalisedEmail },
    select: { id: true },
  });

  // 4. Save to database
  await getPrisma().otpRequest.create({
    data: {
      email: normalisedEmail,
      purpose: params.purpose,
      userId: existingUser?.id,
      codeHash: generated.codeHash,
      payloadHash,
      maxAttempts: env.OTP_MAX_ATTEMPTS,
      ipAddress: params.ipAddress?.slice(0, 45),
      userAgent: params.userAgent?.slice(0, 400),
      expiresAt: generated.expiresAt,
    },
  });

  // 5. Send Email
  try {
    await sendEmailNow({
      to: normalisedEmail,
      templateKey: "otp_code",
      variables: {
        code: generated.code,
        expiryMinutes: env.OTP_TTL_MINUTES,
        recipientName: "Learner",
      },
      userId: existingUser?.id,
    });
  } catch (err) {
    logger.error("[auth] Failed to send OTP email", {
      email: normalisedEmail,
      error: err instanceof Error ? err.message : "unknown",
    });
    // In dev / test, continue; in prod, log and ensure client knows
  }

  const [namePart, domainPart] = normalisedEmail.split("@");
  const maskedEmail = `${namePart.slice(0, 2)}***@${domainPart}`;

  return { success: true, maskedEmail };
}

/**
 * Verifies an OTP code against active database requests.
 */
export async function verifyOtp(params: VerifyOtpParams): Promise<{ valid: boolean; userId?: string }> {
  const env = getEnv();
  const normalisedEmail = params.email.trim().toLowerCase();

  // Rate limiting verify attempts
  const verifyLimit = await consumeRateLimit({
    name: "otp-verify-email",
    limit: env.RL_OTP_VERIFY_LIMIT,
    windowSeconds: env.RL_OTP_VERIFY_WINDOW_MINUTES * 60,
    identifier: normalisedEmail,
  });

  if (!verifyLimit.allowed) {
    throw new RateLimitError(
      "Too many verification attempts. Please request a new code.",
      verifyLimit.retryAfterSeconds,
    );
  }

  const latestOtp = await getPrisma().otpRequest.findFirst({
    where: {
      email: normalisedEmail,
      purpose: params.purpose,
      consumedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!latestOtp) {
    throw new ValidationError("Invalid or expired verification code.");
  }

  const validity = evaluateOtpRequest(latestOtp);
  if (!validity.valid) {
    throw new ValidationError("Invalid or expired verification code.");
  }

  // Increment attempt count
  await getPrisma().otpRequest.update({
    where: { id: latestOtp.id },
    data: { attempts: { increment: 1 } },
  });

  const matches = verifyOtpCode(
    params.code,
    latestOtp.codeHash,
    normalisedEmail,
    params.purpose,
  );

  if (!matches) {
    throw new ValidationError("Invalid verification code. Please check and try again.");
  }

  // Mark consumed
  await getPrisma().otpRequest.update({
    where: { id: latestOtp.id },
    data: { consumedAt: new Date() },
  });

  return { valid: true, userId: latestOtp.userId ?? undefined };
}
