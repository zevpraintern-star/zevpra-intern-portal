import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestOtp } from "@/lib/auth/otp-service";
import { verifyOtp } from "@/lib/auth/otp-service";
import { resetEnvCache } from "@/lib/config/env";

let findFirstResult: { email: string; purpose: string; createdAt: Date; expiresAt: Date; attempts: number; maxAttempts: number; consumedAt: Date | null; resendCount: number | null } | null = null;
const createdRows: Array<Record<string, unknown>> = [];
const createdOtpRows: Array<Record<string, unknown>> = [];
const sentEmails: Array<{ to: string; templateKey: string }> = [];

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: () => ({
    user: { findUnique: async () => ({ id: "user_1" }) },
    otpRequest: {
      findFirst: async () => {
        if (findFirstResult) return findFirstResult;
        return createdOtpRows[createdOtpRows.length - 1] ?? null;
      },
      create: async (args: Record<string, unknown>) => {
        // Prisma create() is called as create({ data: {...} }).
        const payload = (args.data ?? args) as Record<string, unknown>;
        createdRows.push(payload);
        const row = {
          id: "otp_new",
          attempts: 0,
          consumedAt: null,
          createdAt: new Date(),
          ...payload,
        };
        createdOtpRows.push(row);
        return row;
      },
      update: async () => undefined,
    },
  }),
}));

vi.mock("@/lib/redis/rate-limit", () => ({
  consumeRateLimit: async () => ({ allowed: true, limit: 5, remaining: 4, retryAfterSeconds: 0, usedFallback: true }),
}));

vi.mock("@/lib/email/email-service", () => ({
  sendEmailNow: async (input: { to: string; templateKey: string }) => {
    sentEmails.push({ to: input.to, templateKey: input.templateKey });
    return { delivered: true, queued: false, logId: "log_1" };
  },
}));

const baseEnv = {
  NODE_ENV: "test",
  RL_OTP_REQUEST_LIMIT: "5",
  RL_OTP_REQUEST_WINDOW_MINUTES: "15",
  RL_OTP_VERIFY_LIMIT: "10",
  RL_OTP_VERIFY_WINDOW_MINUTES: "15",
  OTP_TTL_MINUTES: "10",
  OTP_RESEND_COOLDOWN_SECONDS: "60",
  OTP_MAX_RESENDS_PER_HOUR: "5",
  OTP_MAX_ATTEMPTS: "5",
  SESSION_SECRET: "test-session-secret-at-least-32-chars-long-123456",
};

function setEnv(overrides: Record<string, string>) {
  Object.assign(process.env, overrides);
  resetEnvCache();
}

const normal = (now: Date) => ({
  email: "learner@example.com",
  purpose: "STUDENT_LOGIN" as const,
  ipAddress: "1.2.3.4",
  userAgent: "test-agent",
});

describe("requestOtp duplicate-email guard", () => {
  beforeEach(() => {
    findFirstResult = null;
    createdRows.length = 0;
    createdOtpRows.length = 0;
    sentEmails.length = 0;
    setEnv(baseEnv);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends one email and creates one row on a first request", async () => {
    const now = new Date();
    setEnv({ ...baseEnv, OTP_RESEND_COOLDOWN_SECONDS: "60" });
    const { maskedEmail } = await requestOtp({ ...normal(now) });
    expect(maskedEmail).toBe("le*****@example.com");
    expect(createdRows).toHaveLength(1);
    expect(createdRows[0].purpose).toBe("STUDENT_LOGIN");
    expect(createdRows[0].resendCount).toBe(0);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].templateKey).toBe("otp_code");
  });

  it("does not send a second email within the cooldown window (reuse)", async () => {
    const now = new Date();
    setEnv({ ...baseEnv, OTP_RESEND_COOLDOWN_SECONDS: "60" });
    await requestOtp({ ...normal(now) });
    expect(sentEmails).toHaveLength(1);

    findFirstResult = {
      email: "learner@example.com",
      purpose: "STUDENT_LOGIN",
      createdAt: new Date(now.getTime() - 30_000),
      expiresAt: new Date(now.getTime() + 9_599_000),
      attempts: 0,
      maxAttempts: 5,
      consumedAt: null,
      resendCount: 0,
    };
    const result = await requestOtp({ ...normal(now) });
    expect(result.success).toBe(true);
    expect(sentEmails).toHaveLength(1);
    expect(createdRows).toHaveLength(1);
  });

  it("allows a legitimate resend after the cooldown window", async () => {
    const now = new Date();
    setEnv({ ...baseEnv, OTP_RESEND_COOLDOWN_SECONDS: "60" });
    await requestOtp({ ...normal(now) });

    findFirstResult = {
      email: "learner@example.com",
      purpose: "STUDENT_LOGIN",
      createdAt: new Date(now.getTime() - 120_000),
      expiresAt: new Date(now.getTime() + 9_599_000),
      attempts: 0,
      maxAttempts: 5,
      consumedAt: null,
      resendCount: 0,
    };
    const result = await requestOtp({ ...normal(now) });
    expect(result.success).toBe(true);
    expect(sentEmails).toHaveLength(2);
    expect(createdRows).toHaveLength(2);
    expect(createdRows[1].resendCount).toBe(1);
  });

  it("rejects a resend past the hourly cap", async () => {
    const now = new Date();
    setEnv({ ...baseEnv, OTP_RESEND_COOLDOWN_SECONDS: "60", OTP_MAX_RESENDS_PER_HOUR: "1" });
    await requestOtp({ ...normal(now) });

    findFirstResult = {
      email: "learner@example.com",
      purpose: "STUDENT_LOGIN",
      createdAt: new Date(now.getTime() - 120_000),
      expiresAt: new Date(now.getTime() + 9_599_000),
      attempts: 0,
      maxAttempts: 5,
      consumedAt: null,
      resendCount: 1,
    };
    await expect(requestOtp({ ...normal(now) })).rejects.toThrow(
      /Too many OTP requests/,
    );
    expect(sentEmails).toHaveLength(1);
    expect(createdRows).toHaveLength(1);
  });

  it("issues a fresh OTP when the existing one is consumed", async () => {
    const now = new Date();
    setEnv({ ...baseEnv, OTP_RESEND_COOLDOWN_SECONDS: "60" });
    await requestOtp({ ...normal(now) });

    findFirstResult = {
      email: "learner@example.com",
      purpose: "STUDENT_LOGIN",
      createdAt: new Date(now.getTime() - 30_000),
      expiresAt: new Date(now.getTime() + 9_599_000),
      attempts: 0,
      maxAttempts: 5,
      consumedAt: new Date(now.getTime() - 10_000),
      resendCount: 0,
    };
    const result = await requestOtp({ ...normal(now) });
    expect(result.success).toBe(true);
    expect(sentEmails).toHaveLength(2);
    expect(createdRows).toHaveLength(2);
    expect(createdRows[1].resendCount).toBe(1);
  });

  it("issues a fresh OTP when the existing one is expired", async () => {
    const now = new Date();
    setEnv({ ...baseEnv, OTP_RESEND_COOLDOWN_SECONDS: "60" });
    await requestOtp({ ...normal(now) });

    findFirstResult = {
      email: "learner@example.com",
      purpose: "STUDENT_LOGIN",
      createdAt: new Date(now.getTime() - 200_000),
      expiresAt: new Date(now.getTime() - 10_000),
      attempts: 0,
      maxAttempts: 5,
      consumedAt: null,
      resendCount: 0,
    };
    const result = await requestOtp({ ...normal(now) });
    expect(result.success).toBe(true);
    expect(sentEmails).toHaveLength(2);
    expect(createdRows).toHaveLength(2);
  });
});

describe("verifyOtp still works after dedup", () => {
  beforeEach(() => {
    findFirstResult = null;
    createdRows.length = 0;
    createdOtpRows.length = 0;
    sentEmails.length = 0;
    setEnv(baseEnv);
  });

  it("rejects a wrong code against a fresh OTP", async () => {
    const now = new Date();
    await requestOtp({ ...normal(now) });
    await expect(
      verifyOtp({
        email: "learner@example.com",
        code: "000000",
        purpose: "STUDENT_LOGIN",
        ipAddress: "1.2.3.4",
      }),
    ).rejects.toThrow(/Invalid verification code/);
  });
});