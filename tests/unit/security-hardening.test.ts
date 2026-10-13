import { describe, expect, it } from "vitest";

import { assertSameOrigin } from "@/lib/api/request";
import { extensionMatches, scanBuffer, sniffMime, suspiciousPdf } from "@/lib/security/file-scan";
import { githubRepoUrlSchema, plainTextSchema, utrSchema } from "@/lib/validation/common";
import { csvCell, csvRow } from "@/server/services/admin";
import { redact } from "@/server/services/audit";
import { backoffMs } from "@/server/jobs/runner";
import { parseGithubRepo } from "@/server/jobs/runner";
import { normaliseUtr } from "@/server/services/payments";

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF" + " ".repeat(20));

describe("file upload security", () => {
  it("recognises real images and PDFs by their bytes", () => {
    expect(sniffMime(png)).toBe("image/png");
    expect(sniffMime(jpg)).toBe("image/jpeg");
    expect(sniffMime(pdf)).toBe("application/pdf");
  });
  it("rejects an executable renamed to .png (MIME spoofing)", () => {
    const exe = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(64)]);
    expect(sniffMime(exe)).toBeNull();
  });
  it("rejects shell scripts, HTML and SVG with script, however they are named", () => {
    for (const body of ["#!/bin/sh\nrm -rf /\n  ", "<html><script>alert(1)</script></html>", '<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>']) {
      expect(sniffMime(Buffer.from(body.padEnd(40, " ")))).toBeNull();
    }
  });
  it("does not let a declared type override the real content", async () => {
    expect((await scanBuffer(png, "application/pdf")).status).toBe("INFECTED");
    expect((await scanBuffer(png, "image/png")).status).toBe("CLEAN");
  });
  it("flags PDFs that embed JavaScript or launch actions", () => {
    expect(suspiciousPdf(Buffer.from("%PDF-1.7 /JavaScript (app.alert(1))"))).toBe(true);
    expect(suspiciousPdf(pdf)).toBe(false);
  });
  it("matches extensions to content (double extensions fail)", () => {
    expect(extensionMatches("image/png", ".png")).toBe(true);
    expect(extensionMatches("image/png", ".php")).toBe(false);
    expect(extensionMatches("image/png", ".png.exe")).toBe(false);
  });
});

describe("CSV export injection", () => {
  it("neutralises spreadsheet formulas", () => {
    for (const evil of ["=HYPERLINK(\"http://evil\",\"x\")", "+1+1", "-2+3", "@SUM(A1:A2)", "\t=cmd", "\r=cmd"]) {
      expect(csvCell(evil).replace(/^"/, "")).toMatch(/^'/);
    }
  });
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvRow(["x", null, 3])).toBe("x,,3\r\n");
  });
});

describe("CSRF origin check", () => {
  const h = (init: Record<string, string>) => new Headers({ host: "localhost:3000", ...init });
  it("accepts same-origin browsers", () => {
    expect(() => assertSameOrigin(h({ "sec-fetch-site": "same-origin" }))).not.toThrow();
    expect(() => assertSameOrigin(h({ origin: "http://localhost:3000" }))).not.toThrow();
  });
  it("rejects cross-site requests and missing origin", () => {
    expect(() => assertSameOrigin(h({ "sec-fetch-site": "cross-site" }))).toThrow();
    expect(() => assertSameOrigin(h({ origin: "https://evil.example" }))).toThrow();
    expect(() => assertSameOrigin(h({}))).toThrow();
  });
  it("cannot be fooled by a look-alike origin", () => {
    expect(() => assertSameOrigin(h({ origin: "http://localhost:3000.evil.example" }))).toThrow();
  });
});

describe("input validation", () => {
  it("accepts only real UTR shapes", () => {
    expect(utrSchema.safeParse("412345678901").success).toBe(true);
    for (const bad of ["", "12", "'; DROP TABLE users;--", "<script>alert(1)</script>", "a b c d e f g h", "x".repeat(60)]) expect(utrSchema.safeParse(bad).success).toBe(false);
  });
  it("normalises UTRs so duplicates cannot hide behind case or spaces", () => {
    expect(normaliseUtr(" ab12 3456 7890 ")).toBe("AB1234567890");
  });
  it("accepts only https github.com repositories", () => {
    expect(githubRepoUrlSchema.safeParse("https://github.com/octocat/hello-world").success).toBe(true);
    for (const bad of ["http://github.com/a/b", "https://evil.com/a/b", "javascript:alert(1)", "https://github.com.evil.com/a/b", "https://github.com/a", "file:///etc/passwd", "https://169.254.169.254/latest/meta-data"]) expect(githubRepoUrlSchema.safeParse(bad).success).toBe(false);
  });
  it("parses repo owner/name safely for the repository check", () => {
    expect(parseGithubRepo("https://github.com/octocat/hello-world")).toEqual({ owner: "octocat", repo: "hello-world" });
    expect(parseGithubRepo("https://github.com/a/b/../../etc")).toBeNull();
  });
  it("strips or rejects markup in free text", () => {
    const parsed = plainTextSchema(200).safeParse("<script>alert(1)</script>hello");
    if (parsed.success) expect(String(parsed.data)).not.toContain("<script");
  });
});

describe("audit redaction", () => {
  it("never stores secrets", () => {
    const out = JSON.stringify(redact({ otp: "123456", password: "x", sessionToken: "t", nested: { passwordHash: "h", ok: "fine" }, authorization: "Bearer abc" }));
    expect(out).not.toMatch(/123456|"x"|Bearer abc|"h"/);
    expect(out).toContain("fine");
  });
});

describe("job retry policy", () => {
  it("backs off exponentially with a ceiling", () => {
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(2)).toBe(120_000);
    expect(backoffMs(20)).toBe(3_600_000);
  });
});
