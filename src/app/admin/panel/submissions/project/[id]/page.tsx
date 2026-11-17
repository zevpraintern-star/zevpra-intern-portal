import { Flash } from "@/components/dashboard/flash";
import { PageHeader, Table, Td, Th } from "@/components/dashboard/primitives";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStaffPage } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { formatDateTime } from "@/lib/utils/format";
import { humaniseEnumValue } from "@/lib/utils/text";
import { reviewProjectSubmission } from "@/server/services/projects";
import { NotFoundError } from "@/lib/api/errors";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";

export default async function ProjectSubmissionReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ flash?: string }>;
}) {
  const { flash } = await searchParams;
  const { id } = await params;
  const staff = await requireStaffPage("projects.review");

  let submission;
  try {
    submission = await getPrisma().projectSubmission.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, title: true, difficulty: true, maxScore: true } },
        student: { select: { name: true, email: true } },
      },
    });
  } catch (e) {
    if (e instanceof Error && (e as { code?: string }).code === "P2002") notFound();
    throw e;
  }

  if (!submission) notFound();

  return (
    <>
      <Flash flash={flash} />
      <PageHeader
        title="Review project submission"
        description={`Submission from ${submission.student.name ?? submission.student.email} for &ldquo;${submission.project.title}&rdquo;`}
      />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader><CardTitle>Project details</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <dl className="grid gap-x-6 gap-y-2">
              <div className="flex justify-between"><dt className="text-muted-foreground">Project</dt><dd><em>{submission.project.title}</em></dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Student</dt><dd>{submission.student.name ?? submission.student.email}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Submitted</dt><dd>{formatDateTime(submission.submittedAt)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Repository check</dt><dd><StatusBadge value={submission.repoCheckStatus} /></dd></div>
            </dl>
            {submission.githubUrl ? <p className="break-all text-muted-foreground"><span className="text-xs text-muted-foreground">GitHub:</span> {submission.githubUrl}</p> : null}
            {submission.liveUrl ? <p className="break-all text-muted-foreground"><span className="text-xs text-muted-foreground">Live URL:</span> {submission.liveUrl}</p> : null}
            {submission.notes ? <p className="whitespace-pre-wrap text-muted-foreground"><span className="text-xs text-muted-foreground">Notes:</span> {submission.notes}</p> : null}
            <div className="pt-2"><StatusBadge value={submission.status} /></div>
            {submission.repoCheckStatus && submission.repoCheckStatus !== "PENDING" ? (
              <p className="mt-2 text-xs text-muted-foreground">Repository check performed: {humaniseEnumValue(submission.repoCheckStatus)}</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Review & verdict</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <form action={async (formData) => {
              const decision = formData.get("decision") as "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
              const feedback = formData.get("feedback") as string;
              const score = formData.get("score") as string;
              await reviewProjectSubmission(staff, {
                submissionId: submission.id,
                decision,
                feedback,
                score: score ? Number(score) : undefined,
              });
              revalidatePath(`/admin/submissions/project/${submission.id}`);
              redirect(`/admin/submissions/project/${submission.id}?flash=reviewed`);
            }}>
              <input type="hidden" name="submissionId" value={submission.id} />

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
                <textarea id="feedback" name="feedback" rows={4} className="rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Explain the feedback to the student…" required />
              </div>

              <div className="grid gap-2 pt-2">
                <label htmlFor="score" className="text-sm font-medium">Project marks (required to approve; max {submission.project.maxScore})</label>
                <input id="score" name="score" type="number" min={0} max={submission.project.maxScore} step={1} className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
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

