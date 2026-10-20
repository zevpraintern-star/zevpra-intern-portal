import { notFound } from "next/navigation";

import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { SelectField, TextArea, TextField } from "@/components/forms/fields";
import { DefinitionList, PageHeader } from "@/components/dashboard/primitives";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStaffPage } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { uuidSchema } from "@/lib/validation/common";
import { formatDateTime } from "@/lib/utils/format";
import { reviewTaskAction } from "@/app/admin/actions";

export default async function ReviewTask({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffPage("tasks.review");
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const s = await getPrisma().taskSubmission.findUnique({ where: { id }, include: { task: true, student: { select: { name: true, email: true } } } });
  if (!s) notFound();
  const open = s.status === "SUBMITTED" || s.status === "UNDER_REVIEW";
  return (
    <>
      <PageHeader title={s.task.title} description={`${s.student.name ?? s.student.email} · attempt ${s.attemptNumber} of ${s.task.maxAttempts}`} actions={<StatusBadge value={s.status} />} />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card><CardHeader><CardTitle>Submission</CardTitle></CardHeader><CardContent className="space-y-4 text-sm">
          <DefinitionList items={[["Submitted", formatDateTime(s.submittedAt)], ["GitHub", s.githubUrl ? <a className="break-all text-primary hover:underline" href={s.githubUrl} target="_blank" rel="noopener noreferrer nofollow">{s.githubUrl}</a> : "-"], ["Live URL", s.liveUrl ?? "-"], ["Hours spent", s.hoursSpent ?? "-"]]} />
          {s.explanation ? <div><p className="text-xs text-muted-foreground">Explanation</p><p className="whitespace-pre-wrap">{s.explanation}</p></div> : null}
          {s.textAnswer ? <div><p className="text-xs text-muted-foreground">Answer</p><p className="whitespace-pre-wrap">{s.textAnswer}</p></div> : null}
          <details className="rounded-lg bg-muted p-3"><summary className="cursor-pointer">Task instructions</summary><p className="mt-2 whitespace-pre-wrap">{s.task.description}{s.task.instructions ? `\n\n${s.task.instructions}` : ""}</p></details>
        </CardContent></Card>
        <Card className="h-fit"><CardHeader><CardTitle>Review</CardTitle></CardHeader><CardContent>
          {!open ? <Alert>Already reviewed.{s.feedback ? ` Feedback: ${s.feedback}` : ""}</Alert> : (
            <ActionForm action={reviewTaskAction}><input type="hidden" name="submissionId" value={s.id} />
              <SelectField label="Decision" name="decision" options={[{ value: "APPROVED", label: "Approve" }, { value: "CHANGES_REQUESTED", label: "Request changes" }, { value: "REJECTED", label: "Reject" }]} />
              <TextArea label="Feedback for the student" name="feedback" rows={5} required hint="Shared with the student by email and in the portal." />
              <TextField label={`Points (max ${s.task.points})`} name="pointsAwarded" type="number" min={0} max={s.task.points} />
              <SubmitButton>Save review</SubmitButton></ActionForm>)}
        </CardContent></Card>
      </div>
    </>
  );
}
