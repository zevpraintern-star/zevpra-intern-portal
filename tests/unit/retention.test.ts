import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Task 4 (storage minimisation) retention sweep.
 *
 * `runRetention` takes its Prisma client as a parameter, so a fake that records
 * every `deleteMany` / `findMany` / `update` call lets us assert the exact
 * retention windows without touching a real database.
 */

const removed: string[] = [];

vi.mock("@/lib/storage/storage-service", () => ({
  getStorageProvider: () => ({
    remove: async (key: string) => {
      removed.push(key);
    },
  }),
}));

const importRetention = () => import("@/server/jobs/retention");

/** Minimal fake that records the `where` clauses it was called with. */
function makeFakePrisma(screenshotRows: Array<{ fileId: string; file: { storageKey: string } }> = []) {
  const calls: Array<{ model: string; where: unknown }> = [];
  const updated: Array<{ id: string; deletedAt: Date }> = [];
  const paymentScreenshotWhere: unknown[] = [];

  const model = (name: string) => ({
    deleteMany: async ({ where }: { where: unknown }) => {
      calls.push({ model: name, where });
      return { count: 0 };
    },
  });

  const fileAsset = {
    ...model("fileAsset"),
    update: async ({ where, data }: { where: { id: string }; data: { deletedAt: Date } }) => {
      updated.push({ id: where.id, deletedAt: data.deletedAt });
      return { id: where.id };
    },
  };

  const paymentScreenshot = {
    findMany: async ({ where }: { where: unknown }) => {
      paymentScreenshotWhere.push(where);
      return screenshotRows;
    },
  };

  return {
    prisma: {
      emailLog: model("emailLog"),
      notification: model("notification"),
      session: model("session"),
      otpRequest: model("otpRequest"),
      backgroundJob: model("backgroundJob"),
      securityEvent: model("securityEvent"),
      auditLog: model("auditLog"),
      fileAsset,
      paymentScreenshot,
    },
    calls,
    updated,
    paymentScreenshotWhere,
  };
}

describe("daily retention sweep", () => {
  beforeEach(() => {
    removed.length = 0;
  });

  it("prunes each table with its own retention window and never touches audit_logs", async () => {
    const { runRetention } = await importRetention();
    const { prisma, calls } = makeFakePrisma();

    await runRetention(prisma as never);

    const byModel = new Map(calls.map((c) => [c.model, c.where]));
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    // email_logs: 30 days
    const email = byModel.get("emailLog") as { queuedAt: { lt: Date } };
    expect(email.queuedAt.lt.getTime()).toBeLessThanOrEqual(now - 29 * DAY + 1000);
    expect(email.queuedAt.lt.getTime()).toBeGreaterThan(now - 31 * DAY);

    // notifications: 90 days
    const notif = byModel.get("notification") as { createdAt: { lt: Date } };
    expect(notif.createdAt.lt.getTime()).toBeLessThanOrEqual(now - 89 * DAY + 1000);
    expect(notif.createdAt.lt.getTime()).toBeGreaterThan(now - 91 * DAY);

    // sessions: 7 days
    const session = byModel.get("session") as { expiresAt: { lt: Date } };
    expect(session.expiresAt.lt.getTime()).toBeLessThanOrEqual(now - 6 * DAY + 1000);
    expect(session.expiresAt.lt.getTime()).toBeGreaterThan(now - 8 * DAY);

    // otp_requests: 1 day
    const otp = byModel.get("otpRequest") as { expiresAt: { lt: Date } };
    expect(otp.expiresAt.lt.getTime()).toBeGreaterThan(now - 2 * DAY);
    expect(otp.expiresAt.lt.getTime()).toBeLessThan(now);

    // background_jobs: 7 days
    const jobs = byModel.get("backgroundJob") as { createdAt: { lt: Date } };
    expect(jobs.createdAt.lt.getTime()).toBeLessThanOrEqual(now - 6 * DAY + 1000);
    expect(jobs.createdAt.lt.getTime()).toBeGreaterThan(now - 8 * DAY);

    // security_events: 180 days
    const security = byModel.get("securityEvent") as { createdAt: { lt: Date } };
    expect(security.createdAt.lt.getTime()).toBeLessThanOrEqual(now - 179 * DAY + 1000);
    expect(security.createdAt.lt.getTime()).toBeGreaterThan(now - 181 * DAY);

    // audit_logs must never be pruned
    expect(byModel.has("auditLog")).toBe(false);
  });

  it("soft-deletes payment screenshots 30 days after the payment decision and removes the stored object", async () => {
    const { runRetention } = await importRetention();
    const { prisma, updated, paymentScreenshotWhere } = makeFakePrisma([
      { fileId: "file_1", file: { storageKey: "payment-screenshots/2026/01/abc.webp" } },
      { fileId: "file_2", file: { storageKey: "payment-screenshots/2026/02/def.webp" } },
    ]);

    const results = await runRetention(prisma as never);

    expect(updated.map((u) => u.id)).toEqual(["file_1", "file_2"]);
    for (const u of updated) expect(u.deletedAt).toBeInstanceOf(Date);

    expect(removed).toEqual([
      "payment-screenshots/2026/01/abc.webp",
      "payment-screenshots/2026/02/def.webp",
    ]);

    const fileEntry = results.find((r) => r.table === "file_assets");
    expect(fileEntry?.deleted).toBe(2);
  });

  it("keys screenshot deletion to the payment decision (reviewedAt), not the upload time", async () => {
    const { runRetention } = await importRetention();
    const { prisma, paymentScreenshotWhere } = makeFakePrisma();

    await runRetention(prisma as never);

    expect(paymentScreenshotWhere).toHaveLength(1);
    const where = paymentScreenshotWhere[0] as {
      paymentRequest: { reviewedAt: { not: null; lt: Date } };
    };
    // Only screenshots whose payment has been decided are eligible.
    expect(where.paymentRequest.reviewedAt.not).toBeNull();
    // ...and only once that decision is at least 30 days old.
    expect(where.paymentRequest.reviewedAt.lt.getTime()).toBeLessThanOrEqual(Date.now() - 29 * 24 * 60 * 60 * 1000 + 1000);
    // It must NOT filter on the file's own createdAt (that would be upload-time based).
    expect(where).not.toHaveProperty("createdAt");
  });

  it("reports one entry per pruned table", async () => {
    const { runRetention } = await importRetention();
    const { prisma } = makeFakePrisma();

    const results = await runRetention(prisma as never);
    const tables = results.map((r) => r.table);

    expect(tables).toEqual([
      "email_logs",
      "notifications",
      "sessions",
      "otp_requests",
      "background_jobs",
      "security_events",
      "file_assets",
    ]);
  });
});
