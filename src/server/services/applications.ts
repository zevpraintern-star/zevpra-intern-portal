import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/errors";
import { getPrisma } from "@/lib/db/prisma";
import { plainTextSchema, requiredTextSchema, uuidSchema } from "@/lib/validation/common";
import { audit, type Actor } from "@/server/services/audit";
import { notifyAndEmail } from "@/server/services/notifications";
import { isAutoApproveEnabled } from "@/server/services/settings";
import { taskScope } from "@/server/services/progress";

export const applySchema = z.object({
  programId: uuidSchema,
  motivation: plainTextSchema(1000).optional(),
});

export const reviewApplicationSchema = z
  .object({
    applicationId: uuidSchema,
    decision: z.enum(["APPROVED", "REJECTED"]),
    reason: requiredTextSchema(1000, 5).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.decision === "REJECTED" && !value.reason) {
      ctx.addIssue({ code: "custom", path: ["reason"], message: "A reason is required and is shared with the student." });
    }
  });

/** Published programs a student can still apply to. */
export async function listOpenPrograms(studentId: string) {
  const now = new Date();
  const [programs, mine] = await Promise.all([
    getPrisma().internshipProgram.findMany({
      where: { status: "PUBLISHED", OR: [{ endDate: null }, { endDate: { gte: now } }] },
      orderBy: [{ isFeatured: "desc" }, { title: "asc" }],
      select: {
        id: true, slug: true, title: true, summary: true, durationLabel: true, difficulty: true, skills: true,
        domain: { select: { name: true } },
      },
    }),
    getPrisma().application.findMany({ where: { studentId }, select: { programId: true, status: true } }),
  ]);
  const status = new Map(mine.map((a) => [a.programId, a.status]));
  return programs.map((p) => ({ ...p, applicationStatus: status.get(p.id) ?? null }));
}

export async function applyToProgram(studentId: string, input: z.infer<typeof applySchema>, actor: Actor) {
  const data = applySchema.parse(input);
  const prisma = getPrisma();
  const program = await prisma.internshipProgram.findFirst({
    where: { id: data.programId, status: "PUBLISHED" },
    select: { id: true, title: true, domainId: true, endDate: true },
  });
  if (!program) throw new NotFoundError("This internship is not open for applications.");
  if (program.endDate && program.endDate.getTime() < Date.now()) throw new ValidationError("Applications for this internship have closed.");

  let application;
  try {
    application = await prisma.application.create({
      data: { studentId, programId: program.id, domainId: program.domainId, motivation: data.motivation },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") throw new ConflictError("You have already applied to this internship.");
    throw error;
  }

  const student = await prisma.user.findUniqueOrThrow({ where: { id: studentId }, select: { email: true, name: true } });
  await audit(actor, "APPLICATION_SUBMITTED", "Application", application.id, { programId: program.id });
  await notifyAndEmail({
    userId: studentId, email: student.email, recipientName: student.name ?? "Student",
    type: "APPLICATION_SUBMITTED", title: "Application received",
    body: `We received your application for ${program.title}.`, link: "/student/internship",
    templateKey: "application_received", variables: { programTitle: program.title },
  });

  if (await isAutoApproveEnabled()) {
    await decideApplication({ userId: null, role: "SYSTEM" }, { applicationId: application.id, decision: "APPROVED" });
  }
  return application;
}

export async function withdrawApplication(studentId: string, applicationId: string): Promise<void> {
  const result = await getPrisma().application.updateMany({
    where: { id: applicationId, studentId, status: "PENDING" },
    data: { status: "WITHDRAWN" },
  });
  if (result.count === 0) throw new NotFoundError("This application cannot be withdrawn.");
}

/**
 * Approve or reject. The status-guarded updateMany makes this safe against double
 * clicks and concurrent admins: only one caller can move PENDING to a decision.
 */
export async function decideApplication(
  actor: Actor,
  input: z.infer<typeof reviewApplicationSchema>,
): Promise<void> {
  const data = reviewApplicationSchema.parse(input);
  const prisma = getPrisma();
  const now = new Date();

  const outcome = await prisma.$transaction(async (tx) => {
    const claimed = await tx.application.updateMany({
      where: { id: data.applicationId, status: "PENDING" },
      data: {
        status: data.decision,
        reviewedById: actor.userId ?? null,
        reviewedAt: now,
        rejectionReason: data.decision === "REJECTED" ? data.reason : null,
        ...(data.decision === "APPROVED" ? { startedAt: now, completionStatus: "IN_PROGRESS" as const } : {}),
      },
    });
    if (claimed.count === 0) throw new ConflictError("This application was already reviewed.");

    const application = await tx.application.findUniqueOrThrow({
      where: { id: data.applicationId },
      select: {
        id: true, studentId: true, programId: true, domainId: true,
        program: { select: { title: true } },
        student: { select: { email: true, name: true } },
      },
    });

    let assigned = 0;
    if (data.decision === "APPROVED") assigned = await assignPublishedTasks(tx, application);
    return { application, assigned };
  });

  const { application } = outcome;
  await audit(actor, data.decision === "APPROVED" ? "APPLICATION_APPROVED" : "APPLICATION_REJECTED", "Application", application.id, {
    tasksAssigned: outcome.assigned,
    reason: data.reason,
  });
  const approved = data.decision === "APPROVED";
  await notifyAndEmail({
    userId: application.studentId, email: application.student.email, recipientName: application.student.name ?? "Student",
    type: approved ? "APPLICATION_APPROVED" : "APPLICATION_REJECTED",
    title: approved ? "Your application was approved" : "Update on your application",
    body: approved
      ? `You're in! Your tasks for ${application.program.title} are ready.`
      : `Your application for ${application.program.title} was not approved. ${data.reason ?? ""}`.trim(),
    link: "/student/internship",
    templateKey: approved ? "application_approved" : "application_rejected",
    variables: { programTitle: application.program.title, reason: data.reason ?? "" },
  });
}

/** Creates a TaskAssignment for every published task the student does not have yet. */
export async function assignPublishedTasks(
  db: Prisma.TransactionClient | ReturnType<typeof getPrisma>,
  application: { studentId: string; programId: string; domainId: string },
): Promise<number> {
  const tasks = await db.task.findMany({ where: taskScope(application), select: { id: true, deadline: true } });
  if (tasks.length === 0) return 0;
  const created = await db.taskAssignment.createMany({
    data: tasks.map((t) => ({ taskId: t.id, studentId: application.studentId, dueAt: t.deadline })),
    skipDuplicates: true,
  });
  return created.count;
}

/** When a task is published later, hand it to every already-approved student. */
export async function assignTaskToEnrolled(taskId: string): Promise<number> {
  const prisma = getPrisma();
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, programId: true, domainId: true, deadline: true, status: true, title: true } });
  if (!task || task.status !== "PUBLISHED") return 0;
  const apps = await prisma.application.findMany({
    where: { programId: task.programId, status: "APPROVED", completionStatus: { not: "COMPLETED" }, ...(task.domainId ? { domainId: task.domainId } : {}) },
    select: { studentId: true, student: { select: { email: true, name: true } } },
  });
  if (apps.length === 0) return 0;
  const created = await prisma.taskAssignment.createMany({
    data: apps.map((a) => ({ taskId: task.id, studentId: a.studentId, dueAt: task.deadline })),
    skipDuplicates: true,
  });
  if (created.count > 0) {
    for (const a of apps) {
      await notifyAndEmail({
        userId: a.studentId, email: a.student.email, recipientName: a.student.name ?? "Student",
        type: "TASK_ASSIGNED", title: "New task assigned", body: `A new task was added: ${task.title}.`, link: "/student/tasks",
        templateKey: "task_assigned", variables: { taskTitle: task.title, dueDate: task.deadline ? task.deadline.toDateString() : "No deadline" },
      }).catch(() => undefined);
    }
  }
  return created.count;
}

/** The student's own application; anything else is indistinguishable from "does not exist". */
export async function getOwnApplication(studentId: string, applicationId: string) {
  const application = await getPrisma().application.findFirst({
    where: { id: applicationId, studentId },
    include: { program: true, domain: { select: { name: true } } },
  });
  if (!application) throw new NotFoundError("Application not found.");
  return application;
}

export async function getActiveApplication(studentId: string, applicationId?: string | null) {
  const apps = await getPrisma().application.findMany({
    where: { studentId, status: "APPROVED" },
    orderBy: { createdAt: "desc" },
    include: { program: true, domain: { select: { name: true } } },
  });
  if (apps.length === 0) return { active: null, all: apps };
  const chosen = applicationId ? apps.find((a) => a.id === applicationId) : apps.find((a) => a.completionStatus !== "COMPLETED") ?? apps[0];
  return { active: chosen ?? apps[0] ?? null, all: apps };
}

export function assertApproved(application: { status: string }): void {
  if (application.status !== "APPROVED") throw new ForbiddenError("Your application has not been approved yet.");
}
