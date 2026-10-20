import { z } from "zod";

import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/errors";
import { getPrisma } from "@/lib/db/prisma";
import { getBranding } from "@/lib/config/branding";
import { projectSubmissionSchema, reviewDecisionSchema } from "@/lib/validation/submission";
import { uuidSchema } from "@/lib/validation/common";
import { audit, securityEvent, type Actor } from "@/server/services/audit";
import { getOwnApplication } from "@/server/services/applications";
import { notifyAndEmail } from "@/server/services/notifications";
import { computeProgress, refreshProgress } from "@/server/services/progress";
import { getPaymentSettings } from "@/server/services/settings";
import { enqueueJob, kickJobs } from "@/server/jobs/queue";

export const selectProjectSchema = z.object({ applicationId: uuidSchema, projectId: uuidSchema });

/** Everything the projects page needs, with the unlock rule evaluated on the server. */
export async function getProjectStage(studentId: string, applicationId: string) {
  const application = await getOwnApplication(studentId, applicationId);
  const progress = await computeProgress(application.id);
  const projects = progress.tasksComplete
    ? await getPrisma().project.findMany({
        where: { programId: application.programId, status: "PUBLISHED" },
        select: { id: true, title: true, description: true, requirements: true, skills: true, difficulty: true },
        orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      })
    : [];
  const submission = application.selectedProjectId
    ? await getPrisma().projectSubmission.findUnique({
        where: { projectId_studentId: { projectId: application.selectedProjectId, studentId } },
      })
    : null;
  return { application, progress, unlocked: progress.tasksComplete, projects, submission };
}

async function requireUnlocked(studentId: string, applicationId: string) {
  const application = await getOwnApplication(studentId, applicationId);
  if (application.status !== "APPROVED") throw new ForbiddenError("Your application has not been approved yet.");
  if (application.completionStatus === "COMPLETED") throw new ConflictError("You have already completed this internship.");
  const progress = await computeProgress(application.id);
  if (!progress.tasksComplete) {
    throw new ForbiddenError("Finish your required tasks to unlock the project step.");
  }
  return application;
}

export async function selectProject(studentId: string, input: z.infer<typeof selectProjectSchema>, actor: Actor) {
  const data = selectProjectSchema.parse(input);
  const application = await requireUnlocked(studentId, data.applicationId);

  const project = await getPrisma().project.findFirst({
    where: { id: data.projectId, programId: application.programId, status: "PUBLISHED" },
    select: { id: true, title: true, difficulty: true },
  });
  if (!project) throw new NotFoundError("Project not found.");

  if (application.selectedProjectId && application.selectedProjectId !== project.id) {
    const existing = await getPrisma().projectSubmission.findUnique({
      where: { projectId_studentId: { projectId: application.selectedProjectId, studentId } },
      select: { id: true },
    });
    if (existing) throw new ConflictError("Your project is locked after you submit it. Ask an administrator to reset it.");
  }

  await getPrisma().application.update({ where: { id: application.id }, data: { selectedProjectId: project.id } });
  await refreshProgress(application.id);
  await audit(actor, "PROJECT_UPDATED", "Application", application.id, { selectedProjectId: project.id });
  return project;
}

export async function submitProject(studentId: string, applicationId: string, input: z.infer<typeof projectSubmissionSchema>, actor: Actor) {
  const data = projectSubmissionSchema.parse(input);
  const application = await requireUnlocked(studentId, applicationId);
  if (application.selectedProjectId !== data.projectId) throw new ValidationError("Choose this project before submitting it.");

  const project = await getPrisma().project.findFirst({
    where: { id: data.projectId, programId: application.programId, status: "PUBLISHED" },
    select: { id: true, title: true, difficulty: true },
  });
  if (!project) throw new NotFoundError("Project not found.");

  const existing = await getPrisma().projectSubmission.findUnique({
    where: { projectId_studentId: { projectId: project.id, studentId } },
  });
  if (existing && ["SUBMITTED", "UNDER_REVIEW"].includes(existing.status)) throw new ConflictError("Your project is already awaiting review.");
  if (existing?.status === "APPROVED") throw new ConflictError("Your project is already approved.");

  const repoTaken = await getPrisma().projectSubmission.findFirst({
    where: { githubUrl: { equals: data.githubUrl, mode: "insensitive" }, studentId: { not: studentId } },
    select: { id: true },
  });
  if (repoTaken) {
    await securityEvent("INVALID_CERTIFICATE_REQUEST", "MEDIUM", { userId: studentId, ipAddress: actor.ipAddress, detail: { reason: "duplicate_repository", projectId: project.id } });
    throw new ConflictError("This repository was already submitted by another account. Submit your own work.");
  }

  const submission = await getPrisma().$transaction(async (tx) => {
    const base = { githubUrl: data.githubUrl, liveUrl: data.liveUrl, notes: data.notes, status: "SUBMITTED" as const, submittedAt: new Date(), reviewedById: null, reviewedAt: null, feedback: null, score: null, repoCheckStatus: "PENDING", repoCheckedAt: null };
    const row = existing
      ? await tx.projectSubmission.update({ where: { id: existing.id }, data: base })
      : await tx.projectSubmission.create({ data: { projectId: project.id, studentId, ...base } });
    return row;
  });

  await enqueueJob("GITHUB_REPO_CHECK", { submissionId: submission.id }, { dedupeKey: `repo:${submission.id}:${submission.submittedAt.getTime()}` });
  await refreshProgress(application.id);
  await audit(actor, "COMPLETION_SUBMITTED", "ProjectSubmission", submission.id, { projectId: project.id });

  const user = await getPrisma().user.findUniqueOrThrow({ where: { id: studentId }, select: { email: true, name: true } });
  await notifyAndEmail({
    userId: studentId, email: user.email, recipientName: user.name ?? "Student", type: "SUBMISSION_RECEIVED",
    title: "Project submitted", body: `Your project "${project.title}" is waiting for verification.`, link: "/student/projects",
    templateKey: "submission_received", variables: { itemTitle: project.title },
  });
  return submission;
}

/**
 * Project verification. Approval is what completes the internship and makes the
 * student certificate-eligible: one transaction, guarded so it can only happen once.
 */
export async function reviewProjectSubmission(actor: Actor, input: z.infer<typeof reviewDecisionSchema>) {
  const data = reviewDecisionSchema.parse(input);
  const prisma = getPrisma();
  const submission = await prisma.projectSubmission.findUnique({
    where: { id: data.submissionId },
    include: { project: { select: { id: true, title: true, programId: true } }, student: { select: { id: true, email: true, name: true } } },
  });
  if (!submission) throw new NotFoundError("Submission not found.");

  const application = await prisma.application.findFirst({
    where: { studentId: submission.studentId, programId: submission.project.programId, status: "APPROVED" },
    select: { id: true, programId: true },
  });
  if (!application) throw new NotFoundError("The student's application could not be found.");
  const payment = await getPaymentSettings();

  const claimed = await prisma.$transaction(async (tx) => {
    const result = await tx.projectSubmission.updateMany({
      where: { id: submission.id, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
      data: { status: data.decision, feedback: data.feedback, score: data.score ?? null, reviewedById: actor.userId ?? null, reviewedAt: new Date() },
    });
    if (result.count === 0) throw new ConflictError("This submission was already reviewed.");

    if (data.decision === "APPROVED") {
      const now = new Date();
      await tx.internshipCompletion.upsert({
        where: { applicationId: application.id },
        update: { githubUrl: submission.githubUrl, liveUrl: submission.liveUrl, status: "APPROVED", reviewedById: actor.userId ?? null, reviewedAt: now, approvedAt: now, feedback: data.feedback },
        create: { applicationId: application.id, studentId: submission.studentId, programId: application.programId, githubUrl: submission.githubUrl, liveUrl: submission.liveUrl, summary: submission.notes, status: "APPROVED", reviewedById: actor.userId ?? null, reviewedAt: now, approvedAt: now, feedback: data.feedback },
      });
      await tx.application.update({
        where: { id: application.id },
        data: { completionStatus: "COMPLETED", completedAt: now, certificateEligibleAt: now, certificateEligibleById: actor.userId ?? null, progressPercent: 100 },
      });
      await tx.paymentRequest.upsert({
        where: { studentId_programId: { studentId: submission.studentId, programId: application.programId } },
        update: {},
        create: { applicationId: application.id, studentId: submission.studentId, programId: application.programId, amount: payment.fee, currency: payment.currency },
      });
    }
    return true;
  });
  void claimed;

  if (data.decision !== "APPROVED") await refreshProgress(application.id);
  const approved = data.decision === "APPROVED";
  await audit(actor, approved ? "COMPLETION_APPROVED" : "COMPLETION_REJECTED", "ProjectSubmission", submission.id, { decision: data.decision });
  if (approved) await audit(actor, "CERTIFICATE_ELIGIBLE", "Application", application.id);

  const fee = `${payment.currency} ${payment.fee}`;
  await notifyAndEmail({
    userId: submission.student.id, email: submission.student.email, recipientName: submission.student.name ?? "Student",
    type: approved ? "CERTIFICATE_ELIGIBLE" : data.decision === "REJECTED" ? "SUBMISSION_REJECTED" : "SUBMISSION_CHANGES_REQUESTED",
    title: approved ? "Internship complete: certificate available" : data.decision === "REJECTED" ? "Project not approved" : "Project changes requested",
    body: approved ? "Your project was verified. You can now request your certificate." : `${submission.project.title}: ${data.feedback}`,
    link: approved ? "/student/payment" : "/student/projects",
    templateKey: approved ? "certificate_eligible" : "submission_rejected",
    variables: { itemTitle: submission.project.title, feedback: data.feedback, certificateFee: fee, currency: payment.currency },
  });
  void getBranding;
  kickJobs();
}
