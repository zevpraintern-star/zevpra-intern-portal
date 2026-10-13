import { describe, expect, it } from "vitest";

import { certificateVerifyQuerySchema } from "@/lib/validation/certificate";

describe("certificateVerifyQuerySchema", () => {
  it("accepts a well-formed certificate id and normalises it to uppercase", () => {
    const parsed = certificateVerifyQuerySchema.parse({ id: "  cert-7f3k9q2m " });
    expect(parsed.id).toBe("CERT-7F3K9Q2M");
  });

  it("rejects an empty id", () => {
    expect(() => certificateVerifyQuerySchema.parse({ id: "   " })).toThrow();
  });

  it("rejects a missing id", () => {
    expect(() => certificateVerifyQuerySchema.parse({ id: null })).toThrow();
  });

  it("rejects the wrong prefix", () => {
    expect(() => certificateVerifyQuerySchema.parse({ id: "XXXX-7F3K9Q2M" })).toThrow();
  });

  it("rejects a random section of the wrong length", () => {
    expect(() => certificateVerifyQuerySchema.parse({ id: "CERT-7F3K9Q" })).toThrow();
    expect(() => certificateVerifyQuerySchema.parse({ id: "CERT-7F3K9Q2MAB" })).toThrow();
  });

  it("rejects characters outside the uppercase alphanumeric alphabet", () => {
    expect(() => certificateVerifyQuerySchema.parse({ id: "CERT-7F3K9Q-M" })).toThrow();
  });
});
