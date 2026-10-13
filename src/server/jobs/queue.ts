import type { Prisma } from "@/generated/prisma/client";
import type { JobType } from "@/generated/prisma/enums";
import { getPrisma } from "@/lib/db/prisma";

export interface EnqueueOptions {
  dedupeKey?: string;
  runAt?: Date;
  priority?: number;
  maxAttempts?: number;
}

type Db = Pick<ReturnType<typeof getPrisma>, "backgroundJob"> | Prisma.TransactionClient;

/** Idempotent when a dedupeKey is given: a second enqueue returns the existing job. */
export async function enqueueJob(
  type: JobType,
  payload: Prisma.InputJsonValue,
  options: EnqueueOptions = {},
  db: Db = getPrisma(),
): Promise<string> {
  if (options.dedupeKey) {
    const existing = await db.backgroundJob.findUnique({ where: { dedupeKey: options.dedupeKey }, select: { id: true } });
    if (existing) return existing.id;
  }
  const job = await db.backgroundJob.create({
    data: {
      type,
      payload,
      dedupeKey: options.dedupeKey,
      runAt: options.runAt ?? new Date(),
      priority: options.priority ?? 0,
      maxAttempts: options.maxAttempts ?? 3,
    },
    select: { id: true },
  });
  return job.id;
}

/**
 * Starts processing without blocking the response. Inside a request Next's `after()`
 * runs the work once the response has been sent; elsewhere (scripts, tests) it simply
 * runs on the next tick. A cron or the worker script also drains the queue, so a
 * missed kick only delays a job, never loses it.
 */
export function kickJobs(): void {
  const run = async () => {
    const { runDueJobs } = await import("./runner");
    await runDueJobs(10);
  };
  void (async () => {
    try {
      const { after } = await import("next/server");
      after(run);
    } catch {
      setImmediate(() => void run().catch(() => undefined));
    }
  })();
}
