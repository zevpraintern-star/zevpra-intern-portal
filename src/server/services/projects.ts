import { z } from "zod";
import { revalidatePath } from "next/cache";

import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/errors";
import { CERTIFICATE_MIN_SCORE_PERCENT } from "@/lib/config/constants";
import { getPrisma } from "@/lib/db/prisma";
import { projectSubmissionSchema, reviewDecisionSchema } from "@/lib/validation/submission";
import { uuidSchema } from "@/lib/validation/common";
import { audit, securityEvent, type Actor } from "@/server/services/audit";
import { getOwnApplication } from "@/server/services/applications";
import { notifyAndEmail } from "@/server/services/notifications";
import { computeProgress, refreshProgress } from "@/server/services/progress";
import { enqueueJob, kickJobs } from "@/server/jobs/queue";
import { deadlineAfterDays, latePenalty, projectDeadlineDays } from "@/lib/difficulty";
import { approvedTaskMarks, scoreBreakdown } from "@/server/services/scoring";

export const selectProjectSchema = z.object({ applicationId: uuidSchema, projectId: uuidSchema });

/** Everything the projects page needs, with the unlock rule evaluated on the server. */
export async function getProjectStage(studentId: string, applicationId: string) {
  const application = await getOwnApplication(studentId, applicationId);
  const progress = await computeProgress(application.id);
  const projects = progress.tasksComplete
    ? await getPrisma().project.findMany({
        where: { programId: application.programId, status: "PUBLISHED" },
        select: { id: true, title: true, description: true, requirements: true, skills: true, difficulty: true, deadline: true },
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
    select: { id: true, title: true, difficulty: true, deadline: true },
  });
  if (!project) throw new NotFoundError("Project not found.");

  if (application.selectedProjectId && application.selectedProjectId !== project.id) {
    const existing = await getPrisma().projectSubmission.findUnique({
      where: { projectId_studentId: { projectId: application.selectedProjectId, studentId } },
      select: { id: true },
    });
    if (existing) throw new ConflictError("Your project is locked after you submit it. Ask an administrator to reset it.");
  }

  const selectedAt = new Date();
  const dueAt = application.selectedProjectId === project.id && application.selectedProjectDueAt
    ? application.selectedProjectDueAt
    : project.deadline ?? deadlineAfterDays(projectDeadlineDays(project.difficulty), selectedAt);
  await getPrisma().application.update({ where: { id: application.id }, data: { selectedProjectId: project.id, selectedProjectDueAt: dueAt } });
  if (dueAt.getTime() > Date.now()) {
    await enqueueJob("NOTIFICATION", { kind: "PROJECT_DEADLINE_REMINDER", applicationId: application.id, projectId: project.id }, {
      dedupeKey: `deadline-project:${application.id}:${project.id}`,
      runAt: new Date(Math.max(Date.now(), dueAt.getTime() - 5 * 60 * 60_000)),
    });
  }
  kickJobs();
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
    select: { id: true, title: true, difficulty: true, deadline: true, maxScore: true },
  });
  if (!project) throw new NotFoundError("Project not found.");

  const existing = await getPrisma().projectSubmission.findUnique({
    where: { projectId_studentId: { projectId: project.id, studentId } },
  });
  if (existing && ["SUBMITTED", "UNDER_REVIEW"].includes(existing.status)) throw new ConflictError("Your project is already awaiting review.");
  if (existing?.status === "APPROVED") throw new ConflictError("Your project is already approved.");

  const dueAt = project.deadline ?? application.selectedProjectDueAt;
  const submittedAt = new Date();
  const isLate = Boolean(dueAt && submittedAt.getTime() > dueAt.getTime());

  const repoTaken = await getPrisma().projectSubmission.findFirst({
    where: { githubUrl: { equals: data.githubUrl, mode: "insensitive" }, studentId: { not: studentId } },
    select: { id: true },
  });
  if (repoTaken) {
    await securityEvent("INVALID_CERTIFICATE_REQUEST", "MEDIUM", { userId: studentId, ipAddress: actor.ipAddress, detail: { reason: "duplicate_repository", projectId: project.id } });
    throw new ConflictError("This repository was already submitted by another account. Submit your own work.");
  }

  const submission = await getPrisma().$transaction(async (tx) => {
    const base = { githubUrl: data.githubUrl, liveUrl: data.liveUrl, notes: data.notes, status: "SUBMITTED" as const, submittedAt, late: isLate, latePenaltyPoints: 0, reviewedById: null, reviewedAt: null, feedback: null, score: null, repoCheckStatus: "PENDING", repoCheckedAt: null };
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
 * Project verification completes the internship and calculates certificate eligibility
 * from approved task and final project marks. Approval is status-guarded to run once.
 */
export async function reviewProjectSubmission(actor: Actor, input: z.infer<typeof reviewDecisionSchema>) {
  const data = reviewDecisionSchema.parse(input);
  const prisma = getPrisma();
  const submission = await prisma.projectSubmission.findUnique({
    where: { id: data.submissionId },
    include: { project: { select: { id: true, title: true, programId: true, maxScore: true } }, student: { select: { id: true, email: true, name: true } } },
  });
  if (!submission) throw new NotFoundError("Submission not found.");
  if (data.score !== undefined && data.score > submission.project.maxScore) {
    throw new ValidationError(`Project score cannot exceed ${submission.project.maxScore}.`, [{ field: "score", message: `Maximum score: ${submission.project.maxScore}.` }]);
  }
  if (data.decision === "APPROVED") {
    if (data.score === undefined) {
      throw new ValidationError("Enter the project score before approving.", [{ field: "score", message: "Project score is required for approval." }]);
    }
  }

  const application = await prisma.application.findFirst({
    where: { studentId: submission.studentId, programId: submission.project.programId, status: "APPROVED" },
    select: { id: true, programId: true, domainId: true },
  });
  if (!application) throw new NotFoundError("The student's application could not be found.");
  const penalty = data.decision === "APPROVED" && submission.late ? latePenalty(submission.project.maxScore, data.score ?? 0) : 0;
  const awarded = data.decision === "APPROVED" ? Math.max(0, (data.score ?? 0) - penalty) : (data.score ?? null);
  const claimed = await prisma.$transaction(async (tx) => {
    const result = await tx.projectSubmission.updateMany({
      where: { id: submission.id, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
      data: { status: data.decision, feedback: data.feedback, score: awarded, latePenaltyPoints: penalty, reviewedById: actor.userId ?? null, reviewedAt: new Date() },
    });
    if (result.count === 0) throw new ConflictError("This submission was already reviewed.");

    let scoreSummary: { percent: number; taskPercent: number; projectPercent: number; eligible: boolean } | null = null;
    if (data.decision === "APPROVED") {
      const taskMarks = await approvedTaskMarks(tx, { studentId: submission.studentId, programId: application.programId, domainId: application.domainId });
      const scores = scoreBreakdown(taskMarks, awarded ?? 0, submission.project.maxScore);
      const eligible = scores.overallPercent > CERTIFICATE_MIN_SCORE_PERCENT;
      scoreSummary = { percent: scores.overallPercent, taskPercent: scores.taskPercent, projectPercent: scores.projectPercent, eligible };

      const now = new Date();
      await tx.internshipCompletion.upsert({
        where: { applicationId: application.id },
        update: { githubUrl: submission.githubUrl, liveUrl: submission.liveUrl, status: "APPROVED", reviewedById: actor.userId ?? null, reviewedAt: now, approvedAt: now, feedback: data.feedback },
        create: { applicationId: application.id, studentId: submission.studentId, programId: application.programId, githubUrl: submission.githubUrl, liveUrl: submission.liveUrl, summary: submission.notes, status: "APPROVED", reviewedById: actor.userId ?? null, reviewedAt: now, approvedAt: now, feedback: data.feedback },
      });
      await tx.application.update({
        where: { id: application.id },
        data: {
          completionStatus: "COMPLETED",
          completedAt: now,
          certificateEligibleAt: eligible ? now : null,
          certificateEligibleById: eligible ? actor.userId ?? null : null,
          progressPercent: 100,
        },
      });
    } else {
      await refreshProgress(application.id, tx);
    }
    return { scoreSummary };
  });

  const approved = data.decision === "APPROVED";
  revalidatePath("/student", "layout");
  revalidatePath("/admin", "layout");
  await audit(actor, approved ? "COMPLETION_APPROVED" : "COMPLETION_REJECTED", "ProjectSubmission", submission.id, { decision: data.decision, late: submission.late, latePenaltyPoints: penalty, projectScore: awarded, ...(claimed.scoreSummary ? { taskScorePercent: claimed.scoreSummary.taskPercent, projectScorePercent: claimed.scoreSummary.projectPercent, overallScorePercent: claimed.scoreSummary.percent } : {}) });
  if (approved && claimed.scoreSummary?.eligible) {
    await audit(actor, "CERTIFICATE_ELIGIBLE", "Application", application.id, { free: true, awaitingAdminRelease: true, scorePercent: claimed.scoreSummary.percent });
  }
  if (approved) {
    await notifyAndEmail({
      userId: submission.student.id,
      email: submission.student.email,
      recipientName: submission.student.name ?? "Student",
      type: "SUBMISSION_APPROVED",
      title: "Final project approved",
      body: claimed.scoreSummary?.eligible
        ? `Your final project is approved. Your overall score is ${claimed.scoreSummary.percent}%, which qualifies for a free certificate. An administrator will release it; we will notify you when it is ready.`
        : `Your final project is approved, but your overall score is ${claimed.scoreSummary?.percent ?? 0}%. Certificate eligibility requires a score greater than ${CERTIFICATE_MIN_SCORE_PERCENT}%.`,
      link: "/student/certificate",
      templateKey: "submission_approved",
      variables: {
        itemTitle: submission.project.title,
        feedback: `Overall score: ${claimed.scoreSummary?.percent ?? 0}%. ${claimed.scoreSummary?.eligible
          ? "This meets the certificate threshold; an administrator will release your free certificate separately."
          : `Certificate eligibility requires a score greater than ${CERTIFICATE_MIN_SCORE_PERCENT}%.`}${data.feedback ? ` Reviewer feedback: ${data.feedback}` : ""}`,
      },
    });
  } else {
    await notifyAndEmail({
      userId: submission.student.id, email: submission.student.email, recipientName: submission.student.name ?? "Student",
      type: data.decision === "REJECTED" ? "SUBMISSION_REJECTED" : "SUBMISSION_CHANGES_REQUESTED",
      title: data.decision === "REJECTED" ? "Project not approved" : "Project changes requested",
      body: `${submission.project.title}: ${data.feedback}`,
      link: "/student/projects",
      templateKey: "submission_rejected",
      variables: { itemTitle: submission.project.title, feedback: data.feedback },
    });
  }
  kickJobs();
}
