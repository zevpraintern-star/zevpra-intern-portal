import { notFound } from "next/navigation";

import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { TextField } from "@/components/forms/fields";
import { DefinitionList, PageHeader } from "@/components/dashboard/primitives";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { can, requireStaffPage } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { uuidSchema } from "@/lib/validation/common";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import { setStudentStatusAction } from "@/app/admin/actions";

export default async function StudentDetail({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffPage("students.view");
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const user = await getPrisma().user.findFirst({
    where: { id, roles: { some: { role: { key: "STUDENT" } } } },
    include: { studentProfile: { include: { resumeFile: { select: { id: true, originalName: true } } } }, applications: { orderBy: { createdAt: "desc" }, include: { program: { select: { title: true } }, domain: { select: { name: true } } } } },
  });
  if (!user || !user.studentProfile) notFound();
  const p = user.studentProfile;
  return (
    <>
      <PageHeader title={p.fullName} description={user.email} actions={<StatusBadge value={user.status} />} />
      <div className="space-y-6">
        <Card><CardHeader><CardTitle>Profile</CardTitle></CardHeader><CardContent><DefinitionList items={[["Mobile", p.mobile], ["College", p.college], ["University", p.university], ["Degree", p.degree], ["Branch", p.branch], ["Year", p.yearOfStudy], ["Graduation", p.graduationYear], ["Location", [p.city, p.state, p.country].filter(Boolean).join(", ")], ["GitHub", p.githubUrl], ["LinkedIn", p.linkedinUrl], ["Joined", formatDateTime(user.createdAt)], ["Last sign-in", user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "-"]]} />
          {p.resumeFile && can(staff, "students.view") ? <p className="mt-4 text-sm"><a className="text-primary hover:underline" href={`/api/files/${p.resumeFile.id}`} target="_blank" rel="noopener noreferrer">Resume: {p.resumeFile.originalName}</a></p> : null}</CardContent></Card>
        <Card><CardHeader><CardTitle>Applications</CardTitle></CardHeader><CardContent className="space-y-3">
          {user.applications.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : user.applications.map((a) => (<div key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{a.program.title} · {a.domain.name} · {formatDate(a.createdAt)}</span><span className="flex gap-2"><StatusBadge value={a.status} /><StatusBadge value={a.completionStatus} /><span className="text-muted-foreground">{a.progressPercent}%</span></span></div>))}
        </CardContent></Card>
        {can(staff, "students.manage") ? (
          <Card><CardHeader><CardTitle>Account</CardTitle></CardHeader><CardContent>
            <ActionForm action={setStudentStatusAction} className="max-w-md"><input type="hidden" name="userId" value={user.id} /><input type="hidden" name="status" value={user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"} />
              <TextField label="Reason (recorded in the audit log)" name="reason" />
              <SubmitButton variant={user.status === "ACTIVE" ? "destructive" : "default"}>{user.status === "ACTIVE" ? "Suspend and sign out" : "Reactivate"}</SubmitButton></ActionForm>
          </CardContent></Card>) : null}
      </div>
    </>
  );
}
