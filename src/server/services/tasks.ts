import { z } from "zod";
import { revalidatePath } from "next/cache";

import { ConflictError, NotFoundError, ValidationError } from "@/lib/api/errors";
import { getPrisma } from "@/lib/db/prisma";
import { reviewDecisionSchema, taskSubmissionSchema } from "@/lib/validation/submission";
import { audit, type Actor } from "@/server/services/audit";
import { notifyAndEmail } from "@/server/services/notifications";
import { refreshProgress, taskScope } from "@/server/services/progress";
import { enforceGithubRequirement } from "@/lib/validation/submission";
import { deadlineAfterDays, latePenalty, taskDeadlineDays } from "@/lib/difficulty";

const OPEN: ReadonlyArray<string> = ["SUBMITTED", "UNDER_REVIEW"];

/** Tasks in the student's own scope with assignment state and latest submission. */
export async function listStudentTasks(studentId: string, application: { programId: string; domainId: string }) {
  const tasks = await getPrisma().task.findMany({
    where: { ...taskScope(application), assignments: { some: { studentId } } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true, title: true, slug: true, difficulty: true, deadline: true, maxAttempts: true, points: true, submissionType: true,
      assignments: { where: { studentId }, select: { status: true, dueAt: true, assignedAt: true } },
      submissions: { where: { studentId }, orderBy: { attemptNumber: "desc" }, take: 1, select: { status: true, attemptNumber: true, feedback: true, late: true, pointsAwarded: true, latePenaltyPoints: true } },
    },
  });
  return tasks.map((t) => ({
    id: t.id, title: t.title, difficulty: t.difficulty, points: t.points, maxAttempts: t.maxAttempts,
    dueAt: t.assignments[0]?.dueAt ?? t.deadline ?? deadlineAfterDays(taskDeadlineDays(t.difficulty), t.assignments[0]?.assignedAt),
    assignmentStatus: t.assignments[0]?.status ?? "ASSIGNED",
    latest: t.submissions[0] ?? null,
  }));
}

/** Fetches a task ONLY if it is assigned to this student; otherwise NotFound (no existence leak). */
export async function getStudentTask(studentId: string, taskId: string) {
  const assignment = await getPrisma().taskAssignment.findUnique({
    where: { taskId_studentId: { taskId, studentId } },
    include: { task: true },
  });
  if (!assignment || assignment.task.status !== "PUBLISHED") throw new NotFoundError("Task not found.");
  const submissions = await getPrisma().taskSubmission.findMany({
    where: { taskId, studentId },
    orderBy: { attemptNumber: "desc" },
  });
  return { assignment, task: assignment.task, submissions };
}

export async function submitTask(studentId: string, input: z.infer<typeof taskSubmissionSchema>, actor: Actor) {
  const data = taskSubmissionSchema.parse(input);
  const prisma = getPrisma();
  const { assignment, task, submissions } = await getStudentTask(studentId, data.taskId);

  const deadline = assignment.dueAt ?? task.deadline ?? deadlineAfterDays(taskDeadlineDays(task.difficulty), assignment.assignedAt);
  const latest = submissions[0];
  if (latest && OPEN.includes(latest.status)) throw new ConflictError("Your previous submission is still awaiting review.");
  if (latest?.status === "APPROVED") throw new ConflictError("This task is already approved.");
  if (submissions.length >= task.maxAttempts) throw new ValidationError("You have used all attempts for this task.");

  // Enforce task-level GitHub requirement via the shared validator.
  enforceGithubRequirement(data, task.requiresGithubLink);
  if (task.submissionType === "GITHUB_LINK" && !data.githubUrl) {
    throw new ValidationError("Add your GitHub repository link.", [{ field: "githubUrl", message: "A GitHub repository link is required for this submission type." }]);
  }

  const problems: Array<{ field: string; message: string }> = [];
  if (task.submissionType === "LIVE_URL" && !data.liveUrl) problems.push({ field: "liveUrl", message: "Add your live URL." });
  if (task.submissionType === "TEXT" && !data.textAnswer) problems.push({ field: "textAnswer", message: "Write your answer." });
  if (task.submissionType === "FILE" && !data.githubUrl) problems.push({ field: "githubUrl", message: "Add a link to your work (e.g. GitHub repository or hosted file)." });
  if (task.submissionType === "MIXED" && !data.githubUrl && !data.liveUrl && !data.textAnswer) {
    problems.push({ field: "explanation", message: "Provide a link, an answer or a file." });
  }
  if (problems.length > 0) throw new ValidationError("Please complete your submission.", problems);

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const submittedAt = new Date();
      const row = await tx.taskSubmission.create({
        data: {
          taskId: task.id, studentId, attemptNumber: submissions.length + 1,
          githubUrl: data.githubUrl, liveUrl: data.liveUrl, explanation: data.explanation,
          textAnswer: data.textAnswer, hoursSpent: data.hoursSpent, submittedAt,
          late: submittedAt.getTime() > deadline.getTime(),
        },
      });
      await tx.taskAssignment.update({ where: { id: assignment.id }, data: { status: "SUBMITTED" } });
      return row;
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") throw new ConflictError("This attempt was already submitted.");
    throw error;
  }

  revalidatePath("/student", "layout");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: studentId }, select: { email: true, name: true } });
  await notifyAndEmail({
    userId: studentId, email: user.email, recipientName: user.name ?? "Student", type: "SUBMISSION_RECEIVED",
    title: "Submission received", body: `We received your submission for ${task.title}.`, link: `/student/tasks/${task.id}`,
    templateKey: "submission_received", variables: { itemTitle: task.title },
  });
  return created;
}

/** Staff review. A status-guarded claim prevents two reviewers deciding the same attempt. */
export async function reviewTaskSubmission(actor: Actor, input: z.infer<typeof reviewDecisionSchema>) {
  const data = reviewDecisionSchema.parse(input);
  const prisma = getPrisma();
  const submission = await prisma.taskSubmission.findUnique({
    where: { id: data.submissionId },
    include: { task: { select: { id: true, title: true, points: true, programId: true, domainId: true } }, student: { select: { id: true, email: true, name: true } } },
  });
  if (!submission) throw new NotFoundError("Submission not found.");
  if (data.pointsAwarded !== undefined && data.pointsAwarded > submission.task.points) {
    throw new ValidationError(`Task marks cannot exceed ${submission.task.points}.`, [{ field: "pointsAwarded", message: `Maximum marks: ${submission.task.points}.` }]);
  }
  if (data.decision === "APPROVED") {
    if (data.pointsAwarded === undefined) {
      throw new ValidationError("Enter the task marks before approving.", [{ field: "pointsAwarded", message: "Task marks are required for approval." }]);
    }
  }

  const penalty = data.decision === "APPROVED" && submission.late
    ? latePenalty(submission.task.points, data.pointsAwarded ?? 0)
    : 0;
  const awarded = data.decision === "APPROVED" ? Math.max(0, (data.pointsAwarded ?? 0) - penalty) : (data.pointsAwarded ?? 0);
  const { application, progress } = await prisma.$transaction(async (tx) => {
    const claimed = await tx.taskSubmission.updateMany({
      where: { id: submission.id, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
      data: {
        status: data.decision, feedback: data.feedback, reviewedById: actor.userId ?? null, reviewedAt: new Date(),
        pointsAwarded: awarded,
        latePenaltyPoints: penalty,
      },
    });
    if (claimed.count === 0) throw new ConflictError("This submission was already reviewed.");

    await tx.taskAssignment.update({
      where: { taskId_studentId: { taskId: submission.taskId, studentId: submission.studentId } },
      data: data.decision === "APPROVED" ? { status: "COMPLETED", completedAt: new Date() } : { status: "IN_PROGRESS" },
    });

    const app = await tx.application.findFirst({
      where: { studentId: submission.studentId, programId: submission.task.programId, status: "APPROVED" },
      select: { id: true },
    });
    return { application: app, progress: app ? await refreshProgress(app.id, tx) : null };
  });

  revalidatePath("/student", "layout");
  revalidatePath("/admin", "layout");
  await audit(actor, "SUBMISSION_REVIEWED", "TaskSubmission", submission.id, { decision: data.decision, late: submission.late, latePenaltyPoints: penalty, pointsAwarded: awarded });
  const approved = data.decision === "APPROVED";
  const type = approved ? "SUBMISSION_APPROVED" : data.decision === "REJECTED" ? "SUBMISSION_REJECTED" : "SUBMISSION_CHANGES_REQUESTED";
  await notifyAndEmail({
    userId: submission.student.id, email: submission.student.email, recipientName: submission.student.name ?? "Student",
    type, title: approved ? "Submission approved" : data.decision === "REJECTED" ? "Submission not approved" : "Changes requested",
    body: `${submission.task.title}: ${data.feedback}${approved && submission.late ? ` Late submission penalty: ${penalty} point${penalty === 1 ? "" : "s"}. Final score: ${awarded}/${submission.task.points}.` : ""}`, link: `/student/tasks/${submission.task.id}`,
    templateKey: approved ? "submission_approved" : "submission_rejected",
    variables: { itemTitle: submission.task.title, feedback: data.feedback },
  });

  return { progress };
}
