import { getPrisma } from "@/lib/db/prisma";
import { getStorageProvider } from "@/lib/storage/storage-service";

/** One day in milliseconds. Retention thresholds are whole-day deltas, so all
  * comparisons use wall-clock time rather than an ever-increasing monotonic clock. */
const ONE_DAY = 24 * 60 * 60 * 1000;

export interface RetentionEntry {
  /** Human-readable table the rows were removed from. */
  table: string;
  /** Rows deleted (or soft-deleted) by this pass. */
  deleted: number;
  at: Date;
}

type PrismaClient = ReturnType<typeof getPrisma>;

/**
 * Retention policy, one entry per pruned table. `audit_logs` is intentionally
 * absent: it is an immutable security trail and must never be pruned.
 *
 * Each entry binds a strongly-typed `deleteMany` to its own timestamp field, so
 * the compiler checks the field name and no dynamic `prisma[model]` access is needed.
 */
const RETENTION_POLICY: ReadonlyArray<{
  table: string;
  field: "queuedAt" | "createdAt" | "expiresAt";
  days: number;
  run: (prisma: PrismaClient, cutoff: Date) => Promise<{ count: number }>;
}> = [
  { table: "email_logs", field: "queuedAt", days: 30, run: (p, c) => p.emailLog.deleteMany({ where: { queuedAt: { lt: c } } }) },
  { table: "notifications", field: "createdAt", days: 90, run: (p, c) => p.notification.deleteMany({ where: { createdAt: { lt: c } } }) },
  { table: "sessions", field: "expiresAt", days: 7, run: (p, c) => p.session.deleteMany({ where: { expiresAt: { lt: c } } }) },
  { table: "otp_requests", field: "expiresAt", days: 1, run: (p, c) => p.otpRequest.deleteMany({ where: { expiresAt: { lt: c } } }) },
  { table: "background_jobs", field: "createdAt", days: 7, run: (p, c) => p.backgroundJob.deleteMany({ where: { createdAt: { lt: c } } }) },
  { table: "security_events", field: "createdAt", days: 180, run: (p, c) => p.securityEvent.deleteMany({ where: { createdAt: { lt: c } } }) },
];

/** Runs the daily retention sweep. */
export async function runRetention(prisma = getPrisma()): Promise<RetentionEntry[]> {
  const now = new Date();
  const results: RetentionEntry[] = [];
  const cutOff = (days: number): Date => new Date(now.getTime() - days * ONE_DAY);

  const record = (table: string, count: number): void => {
    results.push({ table, deleted: Number(count), at: new Date() });
  };

  for (const policy of RETENTION_POLICY) {
    const result = await policy.run(prisma, cutOff(policy.days));
    record(policy.table, result.count);
  }

  // Payment screenshots: delete 30 days after the payment DECISION, not after the
  // upload. A screenshot is only removable once its PaymentRequest has been decided
  // (reviewedAt is set), so screenshots for payments still under review are kept.
  // Mirror the deleteFileAsset convention: soft-delete the registry row, then remove
  // the object from storage.
  const decisionCutoff = cutOff(30);
  const decidedScreenshots = await prisma.paymentScreenshot.findMany({
    where: {
      paymentRequest: { reviewedAt: { not: null, lt: decisionCutoff } },
    },
    select: { fileId: true, file: { select: { storageKey: true } } },
  });

  for (const shot of decidedScreenshots) {
    await prisma.fileAsset.update({
      where: { id: shot.fileId },
      data: { deletedAt: new Date() },
    });
    await getStorageProvider().remove(shot.file.storageKey);
  }
  record("file_assets", decidedScreenshots.length);

  return results;
}
