import Link from "next/link";

import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { TextArea } from "@/components/forms/fields";
import { EmptyState, PageHeader } from "@/components/dashboard/primitives";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { requireStudentPage } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { formatDate } from "@/lib/utils/format";
import { listOpenPrograms } from "@/server/services/applications";
import { Flash } from "@/components/dashboard/flash";
import { applyAction, withdrawAction } from "@/app/student/actions";

export default async function InternshipPage({ searchParams }: { searchParams: Promise<{ flash?: string }> }) {
  const { flash } = await searchParams;
  const student = await requireStudentPage();
  const [apps, open] = await Promise.all([
    getPrisma().application.findMany({ where: { studentId: student.userId }, orderBy: { createdAt: "desc" }, include: { program: { select: { title: true, durationLabel: true } }, domain: { select: { name: true } } } }),
    listOpenPrograms(student.userId),
  ]);
  const available = open.filter((p) => !p.applicationStatus);

  return (
    <>
      <PageHeader title="My internship" description="Your applications, and internships you can still apply to. Every internship is free." />
      <Flash flash={flash} />
      <h2 className="mb-3 font-display text-lg font-semibold">My applications</h2>
      {apps.length === 0 ? <EmptyState title="No applications yet">Pick an internship below.</EmptyState> : (
        <div className="space-y-3">
          {apps.map((a) => (
            <Card key={a.id}><CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
              <div><p className="font-medium">{a.program.title}</p><p className="text-sm text-muted-foreground">{a.domain.name} · {a.program.durationLabel} · applied {formatDate(a.createdAt)}</p>
                {a.status === "REJECTED" && a.rejectionReason ? <p className="mt-1 text-sm text-destructive">Reason: {a.rejectionReason}</p> : null}</div>
              <div className="flex items-center gap-3">
                <StatusBadge value={a.status === "APPROVED" ? a.completionStatus : a.status} />
                {a.status === "APPROVED" ? <Link className="text-sm text-primary underline-offset-4 hover:underline" href={`/student/dashboard?app=${a.id}`}>Open</Link> : null}
                {a.status === "PENDING" ? (
                  <ActionForm action={withdrawAction} className="space-y-0"><input type="hidden" name="applicationId" value={a.id} /><SubmitButton variant="outline" size="sm">Withdraw</SubmitButton></ActionForm>
                ) : null}
              </div>
            </CardContent></Card>
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-10 font-display text-lg font-semibold">Open internships</h2>
      {available.length === 0 ? <EmptyState title="Nothing new to apply to right now" /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {available.map((p) => (
            <Card key={p.id}>
              <CardHeader><CardTitle>{p.title}</CardTitle><CardDescription>{p.domain.name} · {p.durationLabel} · {p.difficulty.toLowerCase()}</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{p.summary}</p>
                <div className="flex flex-wrap gap-1.5">{p.skills.slice(0, 6).map((s) => <Badge key={s} variant="outline">{s}</Badge>)}</div>
                <ActionForm action={applyAction}>
                  <input type="hidden" name="programId" value={p.id} />
                  <TextArea label="Why this internship? (optional)" name="motivation" rows={2} maxLength={1000} />
                  <SubmitButton>Apply for free</SubmitButton>
                </ActionForm>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
