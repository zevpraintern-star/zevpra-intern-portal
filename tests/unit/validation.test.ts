import { describe, expect, it } from "vitest";

import { isEssentialEmailTemplate } from "@/lib/config/constants";
import { isPublicHostname, liveUrlSchema } from "@/lib/validation/common";

/**
 * Task 3 (live URL as link-only) and Task 2 (essential-only email gate) rules.
 *
 * These are pure functions, so they are exercised without a database or Redis.
 */

describe("live URL validation", () => {
  it("accepts public https URLs with normal hostnames", () => {
    for (const url of [
      "https://example.com",
      "https://vercel.app",
      "https://my-project.vercel.app",
      "https://student-portfolio.netlify.app",
      "https://www.example.co.in",
    ]) {
      expect(liveUrlSchema.safeParse(url).success, url).toBe(true);
    }
  });

  it("strips a trailing slash so stored links are stable", () => {
    const parsed = liveUrlSchema.parse("https://example.com/");
    expect(parsed).toBe("https://example.com");
  });

  it("rejects non-https schemes (including javascript: and file:)", () => {
    for (const url of [
      "http://example.com",
      "javascript:alert(1)",
      "file:///etc/passwd",
      "ftp://example.com",
      "data:text/html,hello",
    ]) {
      expect(liveUrlSchema.safeParse(url).success, url).toBe(false);
    }
  });

  it("rejects loopback and link-local addresses (SSRF surface)", () => {
    for (const url of [
      "https://localhost",
      "https://localhost:3000",
      "https://127.0.0.1",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]",
      "https://[::ffff:127.0.0.1]",
    ]) {
      expect(liveUrlSchema.safeParse(url).success, url).toBe(false);
    }
  });

  it("rejects embedded credentials, ports and IP literals", () => {
    for (const url of [
      "https://user:pass@example.com",
      "https://user@example.com",
      "https://example.com:8080",
      "https://192.168.1.1",
      "https://10.0.0.5",
      "https://172.16.0.1",
    ]) {
      expect(liveUrlSchema.safeParse(url).success, url).toBe(false);
    }
  });

  it("rejects empty and malformed values", () => {
    for (const url of ["", "   ", "not a url", "https://", "example.com"]) {
      expect(liveUrlSchema.safeParse(url).success, JSON.stringify(url)).toBe(false);
    }
  });

  it("isPublicHostname allows registrable public names and blocks private ones", () => {
    expect(isPublicHostname("example.com")).toBe(true);
    expect(isPublicHostname("my-app.vercel.app")).toBe(true);
    expect(isPublicHostname("localhost")).toBe(false);
    expect(isPublicHostname("app.local")).toBe(false);
    expect(isPublicHostname("host.internal")).toBe(false);
    expect(isPublicHostname("router.home")).toBe(false);
    expect(isPublicHostname("printer.lan")).toBe(false);
    expect(isPublicHostname("192.168.0.1")).toBe(false);
    expect(isPublicHostname("")).toBe(false);
    expect(isPublicHostname("single")).toBe(false);
  });
});

describe("essential-only email gate", () => {
  it("treats security- and outcome-critical templates as essential", () => {
    for (const key of [
      "otp_code",
      "application_approved",
      "application_rejected",
      "certificate_eligible",
      "payment_approved",
      "payment_rejected",
      "certificate_issued",
      "security_alert",
    ]) {
      expect(isEssentialEmailTemplate(key), key).toBe(true);
    }
  });

  it("suppresses operational noise in essential-only mode", () => {
    for (const key of [
      "welcome",
      "payment_submitted",
      "submission_received",
      "submission_approved",
      "submission_rejected",
    ]) {
      expect(isEssentialEmailTemplate(key), key).toBe(false);
    }
  });

  it("is case-sensitive so a look-alike key is never treated as essential", () => {
    expect(isEssentialEmailTemplate("OTP_CODE")).toBe(false);
    expect(isEssentialEmailTemplate("otp_code ")).toBe(false);
    expect(isEssentialEmailTemplate("")).toBe(false);
  });
});
