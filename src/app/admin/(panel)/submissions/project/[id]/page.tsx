import { notFound } from "next/navigation";

import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { SelectField, TextArea, TextField } from "@/components/forms/fields";
import { DefinitionList, PageHeader } from "@/components/dashboard/primitives";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { can, requireStaffPage } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { uuidSchema } from "@/lib/validation/common";
import { formatDateTime } from "@/lib/utils/format";
import { reviewProjectAction } from "@/app/admin/actions";

export default async function ReviewProject({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffPage("projects.review");
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const s = await getPrisma().projectSubmission.findUnique({ where: { id }, include: { project: true, student: { select: { name: true, email: true } }, files: { include: { file: { select: { id: true, originalName: true } } } } } });
  if (!s) notFound();
  const open = s.status === "SUBMITTED" || s.status === "UNDER_REVIEW";
  const canApprove = can(staff, "completions.review");
  const options = [...(canApprove ? [{ value: "APPROVED", label: "Approve: completes the internship" }] : []), { value: "CHANGES_REQUESTED", label: "Request changes" }, { value: "REJECTED", label: "Reject" }];
  return (
    <>
      <PageHeader title={s.project.title} description={`${s.student.name ?? s.student.email}`} actions={<StatusBadge value={s.status} />} />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card><CardHeader><CardTitle>Submission</CardTitle></CardHeader><CardContent className="space-y-4 text-sm">
          <DefinitionList items={[["Repository", <a key="r" className="break-all text-primary hover:underline" href={s.githubUrl} target="_blank" rel="noopener noreferrer nofollow">{s.githubUrl}</a>], ["Repository check", <StatusBadge key="c" value={s.repoCheckStatus} />], ["Live URL", s.liveUrl ?? "-"], ["Submitted", formatDateTime(s.submittedAt)]]} />
          {s.repoCheckStatus && !["OK", "PENDING"].includes(s.repoCheckStatus) ? <Alert variant="warning">The automatic check could not confirm this is a public repository ({s.repoCheckStatus.replaceAll("_", " ").toLowerCase()}). Open it before approving.</Alert> : null}
          {s.notes ? <div><p className="text-xs text-muted-foreground">Student notes</p><p className="whitespace-pre-wrap">{s.notes}</p></div> : null}
          {s.files.length ? <ul>{s.files.map((f) => <li key={f.fileId}><a className="text-primary hover:underline" href={`/api/files/${f.file.id}`} target="_blank" rel="noopener noreferrer">{f.file.originalName}</a></li>)}</ul> : null}
        </CardContent></Card>
        <Card className="h-fit"><CardHeader><CardTitle>Verify</CardTitle></CardHeader><CardContent>
          {!open ? <Alert>Already reviewed.{s.feedback ? ` Feedback: ${s.feedback}` : ""}</Alert> : (
            <ActionForm action={reviewProjectAction}><input type="hidden" name="submissionId" value={s.id} />
              {!canApprove ? <Alert>You can leave feedback. Only an administrator can approve a final project.</Alert> : null}
              <SelectField label="Decision" name="decision" options={options} />
              <TextArea label="Feedback for the student" name="feedback" rows={5} required />
              <TextField label={`Score (max ${s.project.maxScore})`} name="score" type="number" min={0} max={s.project.maxScore} />
              <SubmitButton>Save decision</SubmitButton></ActionForm>)}
        </CardContent></Card>
      </div>
    </>
  );
}
