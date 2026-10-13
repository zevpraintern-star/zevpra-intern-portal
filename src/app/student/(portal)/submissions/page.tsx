import Link from "next/link";

import { EmptyState, PageHeader } from "@/components/dashboard/primitives";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireStudentPage } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { formatDateTime } from "@/lib/utils/format";

export default async function SubmissionsPage() {
  const student = await requireStudentPage();
  const [tasks, projects] = await Promise.all([
    getPrisma().taskSubmission.findMany({ where: { studentId: student.userId }, orderBy: { submittedAt: "desc" }, take: 100, include: { task: { select: { id: true, title: true } } } }),
    getPrisma().projectSubmission.findMany({ where: { studentId: student.userId }, orderBy: { submittedAt: "desc" }, include: { project: { select: { title: true } } } }),
  ]);
  return (
    <>
      <PageHeader title="Submissions" description="Everything you've submitted, with reviewer feedback." />
      {tasks.length + projects.length === 0 ? <EmptyState title="You haven't submitted anything yet" /> : (
        <div className="space-y-3">
          {projects.map((p) => (<Card key={p.id}><CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6"><div><p className="font-medium">Project: {p.project.title}</p><p className="text-sm text-muted-foreground">{formatDateTime(p.submittedAt)}</p>{p.feedback ? <p className="mt-1 text-sm">{p.feedback}</p> : null}</div><StatusBadge value={p.status} /></CardContent></Card>))}
          {tasks.map((t) => (<Card key={t.id}><CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6"><div><Link className="font-medium hover:underline" href={`/student/tasks/${t.task.id}`}>{t.task.title}</Link><p className="text-sm text-muted-foreground">Attempt {t.attemptNumber} · {formatDateTime(t.submittedAt)}</p>{t.feedback ? <p className="mt-1 text-sm">{t.feedback}</p> : null}</div><StatusBadge value={t.status} /></CardContent></Card>))}
        </div>
      )}
    </>
  );
}
