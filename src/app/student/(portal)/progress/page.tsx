import { EmptyState, PageHeader, ProgressBar } from "@/components/dashboard/primitives";
import { Card, CardContent } from "@/components/ui/card";
import { requireStudentPage } from "@/lib/auth/guards";
import { getActiveApplication } from "@/server/services/applications";
import { computeProgress } from "@/server/services/progress";

export default async function ProgressPage({ searchParams }: { searchParams: Promise<{ app?: string }> }) {
  const student = await requireStudentPage();
  const { active } = await getActiveApplication(student.userId, (await searchParams).app);
  if (!active) return (<><PageHeader title="Progress" /><EmptyState title="Progress appears after your application is approved" /></>);
  const p = await computeProgress(active.id);
  const steps = [
    { label: "Application approved", done: true },
    { label: `Required tasks approved (${p.approvedTasks}/${p.requiredTasks})`, done: p.tasksComplete },
    { label: "Project chosen", done: p.projectSelected },
    { label: "Project submitted", done: p.projectStatus !== null },
    { label: "Project verified", done: p.projectStatus === "APPROVED" },
    { label: "Certificate issued", done: false },
  ];
  const cert = await (await import("@/lib/db/prisma")).getPrisma().certificate.count({ where: { studentId: student.userId, programId: active.programId, status: "GENERATED" } });
  steps[5]!.done = cert > 0;
  return (
    <>
      <PageHeader title="Progress" description={active.program.title} />
      <Card><CardContent className="space-y-6 pt-6"><div><div className="mb-2 flex justify-between text-sm"><span>Overall</span><span className="font-medium">{p.percent}%</span></div><ProgressBar value={p.percent} /></div>
        <ol className="space-y-3">{steps.map((s) => (<li key={s.label} className="flex items-center gap-3 text-sm"><span aria-hidden="true" className={`size-5 rounded-full border ${s.done ? "border-[var(--brand-cyan)] bg-[var(--brand-cyan)]" : "border-border"}`} /><span className={s.done ? "" : "text-muted-foreground"}>{s.label}<span className="sr-only">{s.done ? " (done)" : " (not done)"}</span></span></li>))}</ol>
      </CardContent></Card>
    </>
  );
}
