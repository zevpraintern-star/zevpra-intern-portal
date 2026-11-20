import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";

type Db = ReturnType<typeof getPrisma> | Prisma.TransactionClient;

export interface ApprovedTaskMark {
  taskId: string;
  pointsAwarded: number | null;
  task: { points: number };
}

export interface ScoreBreakdown {
  taskPercent: number;
  projectPercent: number;
  overallPercent: number;
  taskEarned: number;
  taskPossible: number;
  projectEarned: number;
  projectPossible: number;
}

export async function approvedTaskMarks(
  db: Db,
  application: { studentId: string; programId: string; domainId: string },
): Promise<ApprovedTaskMark[]> {
  return db.taskSubmission.findMany({
    where: {
      studentId: application.studentId,
      status: "APPROVED",
      task: { programId: application.programId, OR: [{ domainId: null }, { domainId: application.domainId }] },
    },
    orderBy: [{ taskId: "asc" }, { attemptNumber: "desc" }],
    select: { taskId: true, pointsAwarded: true, task: { select: { points: true } } },
  });
}

function percent(earned: number, possible: number): number {
  return possible > 0 ? Number(((earned / possible) * 100).toFixed(2)) : 0;
}

export function scoreBreakdown(marks: ApprovedTaskMark[], projectEarned: number, projectPossible: number): ScoreBreakdown {
  const latest = new Map<string, ApprovedTaskMark>();
  for (const mark of marks) if (!latest.has(mark.taskId)) latest.set(mark.taskId, mark);
  const taskEarned = [...latest.values()].reduce((sum, mark) => sum + (mark.pointsAwarded ?? 0), 0);
  const taskPossible = [...latest.values()].reduce((sum, mark) => sum + mark.task.points, 0);
  const totalPossible = taskPossible + projectPossible;
  const totalEarned = taskEarned + projectEarned;
  return {
    taskPercent: percent(taskEarned, taskPossible),
    projectPercent: percent(projectEarned, projectPossible),
    overallPercent: percent(totalEarned, totalPossible),
    taskEarned,
    taskPossible,
    projectEarned,
    projectPossible,
  };
}
