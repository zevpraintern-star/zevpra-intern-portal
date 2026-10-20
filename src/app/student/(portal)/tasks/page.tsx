import Link from "next/link";

import { EmptyState, PageHeader } from "@/components/dashboard/primitives";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStudentPage } from "@/lib/auth/guards";
import { formatDate } from "@/lib/utils/format";
import { getActiveApplication } from "@/server/services/applications";
import { computeProgress } from "@/server/services/progress";
import { listStudentTasks } from "@/server/services/tasks";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ app?: string }> }) {
  const student = await requireStudentPage();
  const { active } = await getActiveApplication(student.userId, (await searchParams).app);
  if (!active) return (<><PageHeader title="Tasks" /><EmptyState title="Tasks appear after your application is approved" /></>);

  const [tasks, progress] = await Promise.all([listStudentTasks(student.userId, active), computeProgress(active.id)]);
  const program = active.program;
  const skills = Array.isArray(program.skills) ? program.skills : [];

  return (
    <>
      <PageHeader title="Tasks" description={`${program.title}: ${progress.approvedTasks} of ${progress.totalTasks} approved.${progress.tasksComplete ? " The project step is unlocked." : " Finish your required tasks to unlock the project."}`} />

      <Card className="mt-6"><CardHeader><CardTitle>Internship: {program.title}</CardTitle></CardHeader><CardContent className="space-y-4 pt-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="bg-muted rounded-lg p-3"><p className="text-xs text-muted-foreground">Domain</p><p className="font-medium">{active.domain.name}</p></div>
          <div className="bg-muted rounded-lg p-3"><p className="text-xs text-muted-foreground">Difficulty</p><p className="font-medium">{program.difficulty.toLowerCase()}</p></div>
          <div className="bg-muted rounded-lg p-3"><p className="text-xs text-muted-foreground">Duration</p><p className="font-medium">{program.durationLabel}</p></div>
        </div>
        {program.summary ? <p className="text-sm text-muted-foreground whitespace-pre-wrap">{program.summary}</p> : null}
        {skills.length > 0 ? (
          <div className="flex flex-wrap gap-2"><p className="text-xs text-muted-foreground mb-1">Skills</p>{skills.slice(0, 8).map((s) => <Badge key={s} variant="outline">{s}</Badge>)}</div>
        ) : null}
        <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-3"><span>Program status</span><span className="font-medium">{program.status.toLowerCase()}</span></div>
      </CardContent></Card>

      {tasks.length === 0 ? <EmptyState title="No tasks yet">Your mentors are preparing them.</EmptyState> : (
        <div className="space-y-3 mt-6">
          {tasks.map((t, i) => (
            <Link key={t.id} href={`/student/tasks/${t.id}`} className="block">
              <Card className="transition-colors hover:border-primary/50"><CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                <div className="min-w-0"><p className="font-medium"><span className="mr-2 text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>{t.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{t.difficulty.toLowerCase()} · {t.points} pts{t.dueAt ? ` · due ${formatDate(t.dueAt)}` : ""}{t.latest ? ` · attempt ${t.latest.attemptNumber}/${t.maxAttempts}` : ""}</p></div>
                <StatusBadge value={t.latest && t.assignmentStatus !== "COMPLETED" ? t.latest.status : t.assignmentStatus} />
              </CardContent></Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
