import { Flash } from "@/components/dashboard/flash";
import { PageHeader } from "@/components/dashboard/primitives";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStaffPage } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { formatDateTime } from "@/lib/utils/format";
import { reviewTaskSubmission } from "@/server/services/tasks";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";

export default async function TaskSubmissionReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ flash?: string }>;
}) {
  const { flash } = await searchParams;
  const { id } = await params;
  const staff = await requireStaffPage("tasks.review");

  const subject = await getPrisma().taskSubmission.findUnique({
    where: { id },
    include: {
      task: { select: { id: true, title: true, difficulty: true, points: true, maxAttempts: true } },
      student: { select: { name: true, email: true } },
    },
  });
  if (!subject) notFound();

  return (
    <>
      <Flash flash={flash} />
      <PageHeader
        title="Review task submission"
        description={`Submission for task &ldquo;${subject.task.title}&rdquo; from ${subject.student.name ?? subject.student.email}`}
      />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader><CardTitle>Task details</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <dl className="grid gap-x-6 gap-y-2">
              <div className="flex justify-between"><dt className="text-muted-foreground">Task</dt><dd><em>{subject.task.title}</em></dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Student</dt><dd>{subject.student.name ?? subject.student.email}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Submitted</dt><dd>{formatDateTime(subject.submittedAt)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Attempt</dt><dd>{subject.attemptNumber} of {subject.task.maxAttempts}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Status</dt><dd><StatusBadge value={subject.status} /></dd></div>
              {subject.githubUrl ? <p className="break-all text-muted-foreground"><span className="text-xs text-muted-foreground">GitHub:</span> {subject.githubUrl}</p> : null}
              {subject.liveUrl ? <p className="break-all text-muted-foreground"><span className="text-xs text-muted-foreground">Live URL:</span> {subject.liveUrl}</p> : null}
              {subject.textAnswer ? <p className="whitespace-pre-wrap text-muted-foreground"><span className="text-xs text-muted-foreground">Answer:</span> {subject.textAnswer}</p> : null}
              {subject.explanation ? <p className="whitespace-pre-wrap text-muted-foreground"><span className="text-xs text-muted-foreground">Explanation:</span> {subject.explanation}</p> : null}
              {subject.feedback ? (
                <Alert className="mt-3" variant={subject.status === "APPROVED" ? "success" : "warning"} title="Reviewer feedback">{subject.feedback}</Alert>
              ) : null}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Review &amp; verdict</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <form action={async (formData) => {
              const decision = formData.get("decision") as "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
              const feedback = formData.get("feedback") as string;
              const pointsAwarded = formData.get("pointsAwarded") as string;
              await reviewTaskSubmission(staff, {
                submissionId: subject.id,
                decision,
                feedback,
                pointsAwarded: pointsAwarded ? Number(pointsAwarded) : undefined,
              });
              revalidatePath(`/admin/submissions/task/${subject.id}`);
              redirect(`/admin/submissions/task/${subject.id}?flash=reviewed`);
            }}>
              <input type="hidden" name="submissionId" value={subject.id} />

              <div className="grid gap-2">
                <p className="text-sm font-medium">Decision</p>
                <div className="flex flex-wrap gap-2">
                  <button type="submit" name="decision" value="APPROVED" className="rounded-md border border-green-600 px-3 py-1.5 text-sm hover:bg-green-50">Approve</button>
                  <button type="submit" name="decision" value="CHANGES_REQUESTED" className="rounded-md border border-yellow-600 px-3 py-1.5 text-sm hover:bg-yellow-50">Changes requested</button>
                  <button type="submit" name="decision" value="REJECTED" className="rounded-md border border-red-600 px-3 py-1.5 text-sm hover:bg-red-50">Reject</button>
                </div>
              </div>

              <div className="grid gap-2 pt-2">
                <label htmlFor="feedback" className="text-sm font-medium">Feedback (shown to student)</label>
                <textarea id="feedback" name="feedback" rows={4} className="rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Explain the feedback to the student..." required />
              </div>

              <div className="grid gap-2 pt-2">
                <label htmlFor="pointsAwarded" className="text-sm font-medium">Task marks (required to approve; max {subject.task.points})</label>
                <input id="pointsAwarded" name="pointsAwarded" type="number" min={0} max={subject.task.points} step={1} className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>

              <div className="flex gap-2">
                <button type="submit" className="rounded-md bg-primary px-4 py-1.5 text-sm text-primary-foreground hover:bg-primary/90">Submit verdict</button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

