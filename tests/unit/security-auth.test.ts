import { describe, expect, it } from "vitest";
import {
  constantTimeEqual,
  fingerprintPayload,
  hashPassword,
  randomNumericCode,
  randomToken,
  sha256Hex,
  verifyPassword,
} from "@/lib/security/crypto";
import {
  evaluateOtpRequest,
  hashOtpCode,
  maskEmail,
  verifyOtpCode,
} from "@/lib/security/otp";

describe("Crypto security primitives", () => {
  it("generates random numeric codes with proper length and padding", () => {
    const code = randomNumericCode(6);
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^\d{6}$/);
  });

  it("generates opaque tokens with sufficient entropy", () => {
    const token1 = randomToken(32);
    const token2 = randomToken(32);
    expect(token1).not.toEqual(token2);
    expect(token1.length).toBeGreaterThanOrEqual(32);
  });

  it("produces deterministic SHA-256 hashes", () => {
    const hash1 = sha256Hex("test-token");
    const hash2 = sha256Hex("test-token");
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it("performs constant time string comparison", () => {
    expect(constantTimeEqual("abc123xyz", "abc123xyz")).toBe(true);
    expect(constantTimeEqual("abc123xyz", "abc123xyw")).toBe(false);
    expect(constantTimeEqual("short", "longer_string")).toBe(false);
  });

  it("hashes and verifies admin passwords securely with scrypt", async () => {
    const password = "StrongAdminPassword#2026!";
    const hashed = await hashPassword(password);

    expect(hashed.startsWith("scrypt$")).toBe(true);
    const isValid = await verifyPassword(password, hashed);
    expect(isValid).toBe(true);

    const isInvalid = await verifyPassword("WrongPassword", hashed);
    expect(isInvalid).toBe(false);
  });

  it("fingerprints payload canonically", () => {
    const secret = "test-secret-salt-32-chars-long-123456";
    const fp1 = fingerprintPayload(secret, { b: 2, a: 1 });
    const fp2 = fingerprintPayload(secret, { a: 1, b: 2 });
    expect(fp1).toBe(fp2);
  });
});

describe("OTP Security and Evaluation", () => {
  const email = "learner@example.com";
  const purpose = "STUDENT_LOGIN";

  it("hashes OTP code bound to purpose and email", () => {
    const code = "123456";
    const hash1 = hashOtpCode(code, email, purpose);
    const hash2 = hashOtpCode(code, email, purpose);
    expect(hash1).toBe(hash2);

    // Bound to purpose
    const hashDifferentPurpose = hashOtpCode(code, email, "STUDENT_REGISTER");
    expect(hash1).not.toBe(hashDifferentPurpose);

    // Bound to email
    const hashDifferentEmail = hashOtpCode(code, "other@example.com", purpose);
    expect(hash1).not.toBe(hashDifferentEmail);
  });

  it("verifies OTP code accurately", () => {
    const code = "654321";
    const storedHash = hashOtpCode(code, email, purpose);

    expect(verifyOtpCode("654321", storedHash, email, purpose)).toBe(true);
    expect(verifyOtpCode(" 654 321 ", storedHash, email, purpose)).toBe(true);
    expect(verifyOtpCode("000000", storedHash, email, purpose)).toBe(false);
  });

  it("evaluates OTP state expiration, consumed status, and max attempts", () => {
    const now = new Date();

    // Valid state
    expect(
      evaluateOtpRequest(
        {
          attempts: 0,
          maxAttempts: 5,
          consumedAt: null,
          createdAt: now,
          expiresAt: new Date(now.getTime() + 60000),
        },
        now,
      ),
    ).toEqual({ valid: true });

    // Expired
    expect(
      evaluateOtpRequest(
        {
          attempts: 0,
          maxAttempts: 5,
          consumedAt: null,
          createdAt: new Date(now.getTime() - 120000),
          expiresAt: new Date(now.getTime() - 60000),
        },
        now,
      ),
    ).toEqual({ valid: false, reason: "expired" });

    // Already consumed
    expect(
      evaluateOtpRequest(
        {
          attempts: 1,
          maxAttempts: 5,
          consumedAt: now,
          createdAt: now,
          expiresAt: new Date(now.getTime() + 60000),
        },
        now,
      ),
    ).toEqual({ valid: false, reason: "consumed" });

    // Attempts exceeded
    expect(
      evaluateOtpRequest(
        {
          attempts: 5,
          maxAttempts: 5,
          consumedAt: null,
          createdAt: now,
          expiresAt: new Date(now.getTime() + 60000),
        },
        now,
      ),
    ).toEqual({ valid: false, reason: "attempts_exceeded" });
  });

  it("masks email addresses for user privacy", () => {
    expect(maskEmail("john.doe@gmail.com")).toBe("jo******@gmail.com");
    expect(maskEmail("ab@test.com")).toBe("ab**@test.com");
  });
});
