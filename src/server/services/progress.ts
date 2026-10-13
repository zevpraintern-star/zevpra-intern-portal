import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";

export interface ProgressSummary {
  totalTasks: number;
  approvedTasks: number;
  requiredTasks: number;
  tasksComplete: boolean;
  projectSelected: boolean;
  projectStatus: string | null;
  percent: number;
}

type Db = ReturnType<typeof getPrisma> | Prisma.TransactionClient;

/** Tasks that count for an application: published, in its program, for its domain (or domain-agnostic). */
export function taskScope(app: { programId: string; domainId: string }): Prisma.TaskWhereInput {
  return {
    programId: app.programId,
    status: "PUBLISHED",
    OR: [{ domainId: null }, { domainId: app.domainId }],
  };
}

export async function computeProgress(applicationId: string, db: Db = getPrisma()): Promise<ProgressSummary> {
  const app = await db.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: {
      studentId: true,
      programId: true,
      domainId: true,
      selectedProjectId: true,
      program: { select: { minTasksForCompletion: true } },
    },
  });
  const scope = taskScope(app);
  const [totalTasks, approvedTasks, project] = await Promise.all([
    db.task.count({ where: scope }),
    db.taskAssignment.count({ where: { studentId: app.studentId, status: "COMPLETED", task: scope } }),
    app.selectedProjectId
      ? db.projectSubmission.findUnique({
          where: { projectId_studentId: { projectId: app.selectedProjectId, studentId: app.studentId } },
          select: { status: true },
        })
      : Promise.resolve(null),
  ]);

  const minimum = app.program.minTasksForCompletion;
  const requiredTasks = minimum > 0 ? Math.min(minimum, totalTasks) : totalTasks;
  const tasksComplete = totalTasks === 0 || approvedTasks >= requiredTasks;

  const taskPart = totalTasks === 0 ? 70 : Math.min(70, Math.round((approvedTasks / Math.max(requiredTasks, 1)) * 70));
  let percent = taskPart;
  if (app.selectedProjectId) percent += 10;
  if (project) percent += 10;
  if (project?.status === "APPROVED") percent += 10;

  return {
    totalTasks,
    approvedTasks,
    requiredTasks,
    tasksComplete,
    projectSelected: Boolean(app.selectedProjectId),
    projectStatus: project?.status ?? null,
    percent: Math.min(100, percent),
  };
}

export async function refreshProgress(applicationId: string, db: Db = getPrisma()): Promise<ProgressSummary> {
  const summary = await computeProgress(applicationId, db);
  await db.application.update({ where: { id: applicationId }, data: { progressPercent: summary.percent } });
  return summary;
}
