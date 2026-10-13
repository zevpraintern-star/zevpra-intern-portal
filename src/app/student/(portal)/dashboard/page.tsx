import Link from "next/link";

import { EmptyState, PageHeader, ProgressBar, Stat } from "@/components/dashboard/primitives";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStudentPage } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { formatDate } from "@/lib/utils/format";
import { getActiveApplication } from "@/server/services/applications";
import { computeProgress } from "@/server/services/progress";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ app?: string }> }) {
  const student = await requireStudentPage();
  const { app } = await searchParams;
  const { active } = await getActiveApplication(student.userId, app);
  const [pending, recent] = await Promise.all([
    getPrisma().application.findFirst({ where: { studentId: student.userId, status: "PENDING" }, include: { program: { select: { title: true } } } }),
    getPrisma().notification.findMany({ where: { userId: student.userId }, orderBy: { createdAt: "desc" }, take: 4 }),
  ]);

  if (!active) {
    return (
      <>
        <PageHeader title={`Welcome${student.name ? `, ${student.name.split(" ")[0]}` : ""}`} description="Choose an internship to get started. It's free." />
        {pending ? (
          <EmptyState title="Your application is under review">We're reviewing your application for {pending.program.title}. You'll be notified by email.</EmptyState>
        ) : (
          <EmptyState title="You haven't applied yet">
            <Button asChild className="mt-3"><Link href="/student/internship">Browse internships</Link></Button>
          </EmptyState>
        )}
      </>
    );
  }

  const progress = await computeProgress(active.id);
  const payment = await getPrisma().paymentRequest.findUnique({ where: { studentId_programId: { studentId: student.userId, programId: active.programId } }, select: { status: true, certificate: { select: { status: true } } } });
  const certStatus = payment?.certificate?.status ?? (active.certificateEligibleAt ? (payment?.status === "UNDER_REVIEW" ? "UNDER_REVIEW" : "ELIGIBLE") : "NOT_ELIGIBLE");

  let next = { label: "Open your tasks", href: "/student/tasks" };
  if (progress.tasksComplete && !progress.projectSelected) next = { label: "Choose your project", href: "/student/projects" };
  else if (progress.projectSelected && progress.projectStatus === null) next = { label: "Submit your GitHub repository", href: "/student/projects" };
  else if (progress.projectStatus === "CHANGES_REQUESTED" || progress.projectStatus === "REJECTED") next = { label: "Update your project", href: "/student/projects" };
  else if (active.certificateEligibleAt && payment?.certificate?.status === "GENERATED") next = { label: "View your certificate", href: "/student/certificate" };
  else if (active.certificateEligibleAt) next = { label: "Get your certificate", href: "/student/payment" };

  return (
    <>
      <PageHeader title="Dashboard" description={`${active.program.title} · ${active.domain.name}`} actions={<Button asChild><Link href={next.href}>{next.label}</Link></Button>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Internship status" value={<StatusBadge value={active.completionStatus} />} hint={active.startedAt ? `Started ${formatDate(active.startedAt)}` : undefined} />
        <Stat label="Current domain" value={<span className="text-xl">{active.domain.name}</span>} />
        <Stat label="Progress" value={`${progress.percent}%`} />
        <Stat label="Completed tasks" value={`${progress.approvedTasks} / ${progress.totalTasks}`} />
        <Stat label="Pending tasks" value={Math.max(0, progress.totalTasks - progress.approvedTasks)} />
        <Stat label="Project status" value={<StatusBadge value={progress.projectStatus ?? (progress.tasksComplete ? "NOT_STARTED" : "LOCKED")} />} />
      </div>
      <Card className="mt-4"><CardContent className="space-y-3 pt-6"><ProgressBar value={progress.percent} label="Overall progress" />
        <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Certificate</span><StatusBadge value={certStatus} /></div></CardContent></Card>

      <Card className="mt-6">
        <CardHeader><CardTitle>Recent notifications</CardTitle></CardHeader>
        <CardContent>
          {recent.length === 0 ? <p className="text-sm text-muted-foreground">Nothing yet.</p> : (
            <ul className="divide-y divide-border">
              {recent.map((n) => (<li key={n.id} className="py-3"><p className="text-sm font-medium">{n.title}</p><p className="text-sm text-muted-foreground">{n.body}</p></li>))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
