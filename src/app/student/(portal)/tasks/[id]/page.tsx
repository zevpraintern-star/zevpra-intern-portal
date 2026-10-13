import { Flash } from "@/components/dashboard/flash";
import { notFound } from "next/navigation";

import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { FileField } from "@/components/forms/file-field";
import { TextArea, TextField } from "@/components/forms/fields";
import { DefinitionList, PageHeader } from "@/components/dashboard/primitives";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStudentPage } from "@/lib/auth/guards";
import { isAppError } from "@/lib/api/errors";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import { getStudentTask } from "@/server/services/tasks";
import { submitTaskAction } from "@/app/student/actions";

export default async function TaskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ flash?: string }> }) {
  const { flash } = await searchParams;
  const student = await requireStudentPage();
  const { id } = await params;
  let data;
  try { data = await getStudentTask(student.userId, id); } catch (e) { if (isAppError(e)) notFound(); throw e; }
  const { task, assignment, submissions } = data;
  const latest = submissions[0];
  const closed = latest && (["SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(latest.status));
  const attemptsLeft = task.maxAttempts - submissions.length;
  const deadline = assignment.dueAt ?? task.deadline;
  const overdue = deadline && deadline.getTime() < Date.now();
  const type = task.submissionType;

  return (
    <>
      <Flash flash={flash} />
      <PageHeader title={task.title} description={`${task.difficulty.toLowerCase()} · ${task.points} points`} actions={<StatusBadge value={assignment.status} />} />
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <Card><CardHeader><CardTitle>Instructions</CardTitle></CardHeader><CardContent className="space-y-4 text-sm leading-relaxed">
            <p className="whitespace-pre-wrap">{task.description}</p>
            {task.instructions ? <p className="whitespace-pre-wrap text-muted-foreground">{task.instructions}</p> : null}
            <DefinitionList items={[["Deadline", deadline ? formatDateTime(deadline) : "No deadline"], ["Attempts", `${submissions.length} of ${task.maxAttempts} used`], ["Submit as", type.replaceAll("_", " ").toLowerCase()]]} />
          </CardContent></Card>

          {submissions.length > 0 ? (
            <Card><CardHeader><CardTitle>Your submissions</CardTitle></CardHeader><CardContent className="space-y-4">
              {submissions.map((s) => (
                <div key={s.id} className="rounded-lg border border-border p-4 text-sm">
                  <div className="flex items-center justify-between"><p className="font-medium">Attempt {s.attemptNumber} · {formatDate(s.submittedAt)}</p><StatusBadge value={s.status} /></div>
                  {s.githubUrl ? <p className="mt-2 break-all text-muted-foreground">{s.githubUrl}</p> : null}
                  {s.feedback ? <Alert className="mt-3" variant={s.status === "APPROVED" ? "success" : "warning"} title="Reviewer feedback">{s.feedback}</Alert> : null}
                </div>
              ))}
            </CardContent></Card>
          ) : null}
        </div>

        <Card className="h-fit"><CardHeader><CardTitle>{closed ? "Submission" : "Submit your work"}</CardTitle></CardHeader><CardContent>
          {latest?.status === "APPROVED" ? <Alert variant="success">This task is approved. Nice work.</Alert>
          : closed ? <Alert>Your submission is waiting for review. You can resubmit only if changes are requested.</Alert>
          : overdue ? <Alert variant="destructive">The deadline for this task has passed.</Alert>
          : attemptsLeft <= 0 ? <Alert variant="destructive">You have used all attempts for this task.</Alert>
          : (
            <ActionForm action={submitTaskAction} resetOnSuccess>
              <input type="hidden" name="taskId" value={task.id} />
              {(type === "GITHUB_LINK" || type === "MIXED" || task.requiresGithubLink) ? <TextField label="GitHub repository" name="githubUrl" placeholder="https://github.com/you/repo" required={type === "GITHUB_LINK" || task.requiresGithubLink} /> : null}
              {(type === "LIVE_URL" || type === "MIXED") ? <TextField label="Live URL" name="liveUrl" placeholder="https://" /> : null}
              {(type === "TEXT" || type === "MIXED") ? <TextArea label="Your answer" name="textAnswer" rows={6} /> : null}
              <TextArea label="What did you do? (explanation)" name="explanation" rows={3} hint="Min 10 characters. Mention what you learned or struggled with." />
              {(type === "FILE" || type === "MIXED") ? <FileField label="Files" name="fileIds" purpose="TASK_SUBMISSION" multiple hint="PNG, JPG, WEBP or PDF" /> : null}
              <SubmitButton pendingLabel="Submitting…">Submit for review</SubmitButton>
            </ActionForm>
          )}
        </CardContent></Card>
      </div>
    </>
  );
}
