import { getEnv } from "@/lib/config/env";
import { getPrisma } from "@/lib/db/prisma";
import { processEmailJob, queueEmail } from "@/lib/email/email-service";
import { getBranding } from "@/lib/config/branding";
import { formatDateTime } from "@/lib/utils/format";
import { logger } from "@/lib/logger";
import { scanBuffer, sniffMime } from "@/lib/security/file-scan";
import { loadPrivateFile } from "@/lib/storage/storage-service";
import { generateCertificate } from "@/server/services/certificates";

type Payload = Record<string, unknown>;

export function parseGithubRepo(url: string): { owner: string; repo: string } | null {
  const m = /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(url.trim());
  return m ? { owner: m[1] as string, repo: m[2] as string } : null;
}

/** Records whether the submitted repository exists and is public; reviewers see the result. */
async function checkRepository(submissionId: string): Promise<void> {
  const prisma = getPrisma();
  const submission = await prisma.projectSubmission.findUnique({ where: { id: submissionId }, select: { githubUrl: true } });
  if (!submission) return;
  const repo = parseGithubRepo(submission.githubUrl);
  let status = "INVALID_URL";
  if (repo) {
    try {
      const token = getEnv().GITHUB_TOKEN;
      const response = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}`, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "internship-portal", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        signal: AbortSignal.timeout(6000),
      });
      if (response.status === 200) {
        const body = (await response.json()) as { private?: boolean; archived?: boolean };
        status = body.private ? "PRIVATE" : "OK";
      } else if (response.status === 404) status = "NOT_FOUND_OR_PRIVATE";
      else if (response.status === 403 || response.status === 429) throw new Error("GitHub rate limit reached");
      else status = "UNREACHABLE";
    } catch (error) {
      if (error instanceof Error && error.message.includes("rate limit")) throw error;
      status = "UNREACHABLE";
    }
  }
  await prisma.projectSubmission.update({ where: { id: submissionId }, data: { repoCheckStatus: status, repoCheckedAt: new Date() } });
}

async function scanFile(fileId: string): Promise<void> {
  const prisma = getPrisma();
  const { asset, body } = await loadPrivateFile(fileId);
  const claimed = sniffMime(body);
  const outcome = await scanBuffer(body, claimed);
  await prisma.fileAsset.update({ where: { id: asset.id }, data: { scanStatus: outcome.status, scannedAt: new Date() } });
  if (outcome.status === "INFECTED") {
    await prisma.securityEvent.create({
      data: { type: "MALICIOUS_FILE_ATTEMPT", severity: "HIGH", userId: asset.ownerUserId, detail: { fileId: asset.id, reason: outcome.reason ?? "flagged" } },
    });
  }
}

async function processDeadlineReminder(payload: Payload): Promise<void> {
  const prisma = getPrisma();
  const kind = payload.kind;
  if (kind === "TASK_DEADLINE_REMINDER") {
    const taskId = String(payload.taskId ?? "");
    const studentId = String(payload.studentId ?? "");
    const assignment = await prisma.taskAssignment.findUnique({
      where: { taskId_studentId: { taskId, studentId } },
      select: { status: true, dueAt: true, task: { select: { title: true } }, student: { select: { email: true, name: true } } },
    });
    if (!assignment || !assignment.dueAt || !["ASSIGNED", "IN_PROGRESS"].includes(assignment.status) || assignment.dueAt <= new Date()) return;
    await queueEmail({
      to: assignment.student.email, userId: studentId, templateKey: "deadline_reminder",
      variables: { recipientName: assignment.student.name ?? "Student", itemType: "task", itemTitle: assignment.task.title, dueAt: formatDateTime(assignment.dueAt), actionUrl: `${getBranding().appUrl}/student/tasks/${taskId}` },
    });
    return;
  }
  if (kind === "PROJECT_DEADLINE_REMINDER") {
    const applicationId = String(payload.applicationId ?? "");
    const projectId = String(payload.projectId ?? "");
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { status: true, completionStatus: true, studentId: true, selectedProjectId: true, selectedProjectDueAt: true, selectedProject: { select: { title: true } }, student: { select: { email: true, name: true } } },
    });
    if (!application || !application.selectedProject || application.selectedProjectId !== projectId || application.status !== "APPROVED" || application.completionStatus !== "IN_PROGRESS" || !application.selectedProjectDueAt || application.selectedProjectDueAt <= new Date()) return;
    const submission = await prisma.projectSubmission.findUnique({ where: { projectId_studentId: { projectId, studentId: application.studentId } }, select: { id: true } });
    if (submission) return;
    await queueEmail({
      to: application.student.email, userId: application.studentId, templateKey: "deadline_reminder",
      variables: { recipientName: application.student.name ?? "Student", itemType: "project", itemTitle: application.selectedProject.title, dueAt: formatDateTime(application.selectedProjectDueAt), actionUrl: `${getBranding().appUrl}/student/projects` },
    });
  }
}

const HANDLERS: Record<string, (job: { id: string; payload: Payload }) => Promise<void>> = {
  EMAIL: async (job) => {
    const result = await processEmailJob(job.id);
    // A message suppressed by essential-only mode is a successful no-op, not a failure,
    // so the job must not be retried.
    if (!result.delivered && !result.skipped) throw new Error(result.error ?? "email delivery failed");
  },
  CERTIFICATE_PDF: async (job) => generateCertificate(String(job.payload.certificateId)),
  GITHUB_REPO_CHECK: async (job) => checkRepository(String(job.payload.submissionId)),
  FILE_SCAN: async (job) => scanFile(String(job.payload.fileId)),
  NOTIFICATION: async (job) => processDeadlineReminder(job.payload),
  CSV_EXPORT: async () => undefined,
};

/** Exponential backoff: 30s, 2m, 8m ... capped at one hour. */
export function backoffMs(attempt: number): number {
  return Math.min(30_000 * 4 ** Math.max(0, attempt - 1), 3_600_000);
}

/**
 * Claims and runs due jobs. The QUEUED -> RUNNING flip is a guarded updateMany, so two
 * workers (or a cron plus an after() kick) can never run the same job twice.
 * Returns how many jobs were processed.
 */
export async function runDueJobs(limit = 10): Promise<number> {
  const prisma = getPrisma();
  const due = await prisma.backgroundJob.findMany({
    where: { status: "QUEUED", runAt: { lte: new Date() } },
    orderBy: [{ priority: "desc" }, { runAt: "asc" }],
    take: limit,
    select: { id: true, type: true, payload: true, attempts: true, maxAttempts: true },
  });

  let processed = 0;
  for (const job of due) {
    const claimed = await prisma.backgroundJob.updateMany({
      where: { id: job.id, status: "QUEUED" },
      data: { status: "RUNNING", startedAt: new Date(), attempts: { increment: 1 } },
    });
    if (claimed.count === 0) continue;
    processed += 1;
    const attempt = job.attempts + 1;
    try {
      const handler = HANDLERS[job.type];
      if (!handler) throw new Error(`No handler for job type ${job.type}`);
      await handler({ id: job.id, payload: (job.payload ?? {}) as Payload });
      await prisma.backgroundJob.update({ where: { id: job.id }, data: { status: "SUCCEEDED", finishedAt: new Date(), lastError: null } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      const final = attempt >= job.maxAttempts;
      logger.error("[jobs] failed", { id: job.id, type: job.type, attempt, final, error: message });
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: final
          ? { status: "FAILED", finishedAt: new Date(), lastError: message.slice(0, 2000) }
          : { status: "QUEUED", runAt: new Date(Date.now() + backoffMs(attempt)), lastError: message.slice(0, 2000) },
      });
    }
  }
  return processed;
}

/** Re-queues jobs stuck in RUNNING (a crashed worker) so they are not lost. */
export async function recoverStuckJobs(olderThanMinutes = 10): Promise<number> {
  const result = await getPrisma().backgroundJob.updateMany({
    where: { status: "RUNNING", startedAt: { lt: new Date(Date.now() - olderThanMinutes * 60_000) } },
    data: { status: "QUEUED" },
  });
  return result.count;
}
