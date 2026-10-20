import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Task 3 (links-only submissions): the ONLY student upload left is the payment
 * screenshot; staff may upload the payment QR. Every other purpose is rejected
 * before anything is written. These tests exercise the route handler with the
 * session, guards, rate-limit, storage and job modules mocked out.
 */

const studentSession = { id: "sess_s", userId: "user_s", user: { id: "user_s", email: "s@test.dev", name: "Student", roles: [] } };
const adminSession = { id: "sess_a", userId: "user_a", user: { id: "user_a", email: "a@test.dev", name: "Admin", roles: [] } };

let activeStudent: typeof studentSession | null = studentSession;
let activeAdmin: typeof adminSession | null = null;
let staffPermissions: Set<string> = new Set(["settings.manage"]);

const saved: Array<{ purpose: string; ownerUserId: string | null }> = [];

vi.mock("@/lib/auth/session", () => ({
  getSession: async (kind: "STUDENT" | "ADMIN") => (kind === "STUDENT" ? activeStudent : activeAdmin),
}));

vi.mock("@/lib/auth/guards", () => ({
  loadStaffContext: async () => ({
    userId: "user_a",
    email: "a@test.dev",
    name: "Admin",
    sessionId: "sess_a",
    roles: ["ADMIN"],
    permissions: staffPermissions,
    isSuperAdmin: false,
    primaryRole: "ADMIN",
  }),
  can: (_staff: unknown, permission: string) => staffPermissions.has(permission),
}));

vi.mock("@/lib/redis/rate-limit", () => ({
  consumeRateLimit: async () => ({ allowed: true, limit: 20, remaining: 19, retryAfterSeconds: 0, usedFallback: true }),
  clientIpFromHeaders: (headers: Headers) => headers.get("x-real-ip") || "127.0.0.1",
  rateLimits: { upload: () => ({ name: "upload", identifier: "x", limit: 20, windowSeconds: 60 }) },
}));

vi.mock("@/lib/storage/storage-service", () => ({
  validateUpload: ({ originalName }: { originalName: string }) => {
    const ext = originalName.slice(originalName.lastIndexOf(".")).toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".webp", ".pdf"].includes(ext)) {
      throw new Error("Allowed file types: .png, .jpg, .jpeg, .webp, .pdf.");
    }
    return { extension: ext };
  },
  saveUpload: async (input: { purpose: string; ownerUserId: string | null }) => {
    saved.push({ purpose: input.purpose, ownerUserId: input.ownerUserId });
    return { id: "file_new", originalName: "a.png", sizeBytes: 100 };
  },
}));

vi.mock("@/server/services/audit", () => ({
  securityEvent: async () => undefined,
}));

vi.mock("@/server/jobs/queue", () => ({
  enqueueJob: async () => "job_1",
  kickJobs: () => undefined,
}));

const importPost = () => import("@/app/api/uploads/route").then((m) => m.POST);

/** A 1x1 PNG that sniffs correctly as image/png. */
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);

function buildRequest(purpose: string): NextRequest {
  const form = new FormData();
  form.set("file", new File([PNG_BYTES], "shot.png", { type: "image/png" }));
  form.set("purpose", purpose);
  return new NextRequest("http://localhost:3000/api/uploads", {
    method: "POST",
    headers: {
      "sec-fetch-site": "same-origin",
      host: "localhost:3000",
      origin: "http://localhost:3000",
    },
    body: form,
  });
}

describe("upload purpose restriction", () => {
  beforeEach(() => {
    saved.length = 0;
    activeStudent = studentSession;
    activeAdmin = null;
    staffPermissions = new Set(["settings.manage"]);
  });


  it("allows a student to upload a payment screenshot", async () => {
    const POST = await importPost();
    const res = await POST(buildRequest("PAYMENT_SCREENSHOT"), {} as never);
    expect(res.status).toBe(201);
    expect(saved).toEqual([{ purpose: "PAYMENT_SCREENSHOT", ownerUserId: "user_s" }]);
  });

  it("rejects every other student purpose without writing anything", async () => {
    const POST = await importPost();
    for (const purpose of ["RESUME", "TASK_SUBMISSION", "PROJECT_FILE", "PROJECT_SCREENSHOT", "AVATAR", "CERTIFICATE_TEMPLATE"]) {
      const res = await POST(buildRequest(purpose), {} as never);
      expect(res.status, purpose).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_FAILED");
    }
    expect(saved).toEqual([]);
  });

  it("rejects an unknown purpose string", async () => {
    const POST = await importPost();
    const res = await POST(buildRequest("ANYTHING_ELSE"), {} as never);
    expect(res.status).toBe(400);
    expect(saved).toEqual([]);
  });

  it("requires authentication for a student upload", async () => {
    activeStudent = null;
    const POST = await importPost();
    const res = await POST(buildRequest("PAYMENT_SCREENSHOT"), {} as never);
    expect(res.status).toBe(401);
    expect(saved).toEqual([]);
  });

  it("lets staff with settings.manage upload the payment QR", async () => {
    activeStudent = null;
    activeAdmin = adminSession;
    const POST = await importPost();
    const res = await POST(buildRequest("PAYMENT_QR"), {} as never);
    expect(res.status).toBe(201);
    expect(saved).toEqual([{ purpose: "PAYMENT_QR", ownerUserId: "user_a" }]);
  });

  it("blocks staff without the settings.manage permission from the QR upload", async () => {
    activeStudent = null;
    activeAdmin = adminSession;
    staffPermissions = new Set(["payments.view"]);
    const POST = await importPost();
    const res = await POST(buildRequest("PAYMENT_QR"), {} as never);
    expect(res.status).toBe(403);
    expect(saved).toEqual([]);
  });

  it("does not let a student perform the staff-only QR upload", async () => {
    activeStudent = studentSession;
    activeAdmin = null;
    const POST = await importPost();
    const res = await POST(buildRequest("PAYMENT_QR"), {} as never);
    expect(res.status).toBe(401);
    expect(saved).toEqual([]);
  });
});
