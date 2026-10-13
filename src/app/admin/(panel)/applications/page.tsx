import { Flash } from "@/components/dashboard/flash";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { TextField } from "@/components/forms/fields";
import { EmptyState, PageHeader } from "@/components/dashboard/primitives";
import { Pagination, parsePaging } from "@/components/dashboard/pagination";
import { Card, CardContent } from "@/components/ui/card";
import { requireStaffPage } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { formatDate } from "@/lib/utils/format";
import { reviewApplicationAction } from "@/app/admin/actions";

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaffPage("applications.review");
  const sp = await searchParams;
  const { page, size, skip } = parsePaging(sp);
  const flash = typeof sp.flash === "string" ? sp.flash : undefined;
  const where = { status: "PENDING" as const };
  const [rows, total] = await Promise.all([
    getPrisma().application.findMany({ where, orderBy: { createdAt: "asc" }, skip, take: size, include: { student: { select: { email: true, studentProfile: { select: { fullName: true, college: true, branch: true, yearOfStudy: true } } } }, program: { select: { title: true } }, domain: { select: { name: true } } } }),
    getPrisma().application.count({ where }),
  ]);
  return (
    <>
      <Flash flash={flash} />
      <PageHeader title="Applications" description={`${total} waiting for a decision, oldest first.`} />
      {rows.length === 0 ? <EmptyState title="Inbox zero" /> : <div className="space-y-3">{rows.map((a) => (
        <Card key={a.id}><CardContent className="grid gap-4 pt-6 lg:grid-cols-[1fr_auto]">
          <div className="text-sm"><p className="font-medium">{a.student.studentProfile?.fullName ?? a.student.email}</p>
            <p className="text-muted-foreground">{a.student.email} · {a.student.studentProfile?.college} · {a.student.studentProfile?.branch}, year {a.student.studentProfile?.yearOfStudy}</p>
            <p className="mt-1">{a.program.title} · {a.domain.name} · applied {formatDate(a.createdAt)}</p>{a.motivation ? <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{a.motivation}</p> : null}</div>
          <div className="flex flex-col gap-2 lg:w-72">
            <ActionForm action={reviewApplicationAction} className="space-y-2"><input type="hidden" name="applicationId" value={a.id} /><input type="hidden" name="decision" value="APPROVED" /><SubmitButton className="w-full">Approve</SubmitButton></ActionForm>
            <ActionForm action={reviewApplicationAction} className="space-y-2"><input type="hidden" name="applicationId" value={a.id} /><input type="hidden" name="decision" value="REJECTED" /><TextField label="Rejection reason" name="reason" /><SubmitButton variant="outline" className="w-full">Reject</SubmitButton></ActionForm>
          </div></CardContent></Card>))}</div>}
      <Pagination base="/admin/applications" params={{}} page={page} size={size} total={total} />
    </>
  );
}
