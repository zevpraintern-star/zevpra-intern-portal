import { Flash } from "@/components/dashboard/flash";
import { Lock } from "lucide-react";

import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { FileField } from "@/components/forms/file-field";
import { TextArea, TextField } from "@/components/forms/fields";
import { EmptyState, PageHeader } from "@/components/dashboard/primitives";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { requireStudentPage } from "@/lib/auth/guards";
import { getActiveApplication } from "@/server/services/applications";
import { getProjectStage } from "@/server/services/projects";
import { selectProjectAction, submitProjectAction } from "@/app/student/actions";

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ app?: string; flash?: string }> }) {
  const student = await requireStudentPage();
  const sp = await searchParams;
  const { active } = await getActiveApplication(student.userId, sp.app);
  if (!active) return (<><PageHeader title="Projects" /><EmptyState title="Projects appear after your application is approved" /></>);

  const stage = await getProjectStage(student.userId, active.id);
  const selected = stage.projects.find((p) => p.id === active.selectedProjectId) ?? null;
  const sub = stage.submission;
  const open = sub && ["SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(sub.status);

  if (!stage.unlocked) {
    return (<><PageHeader title="Projects" description="Your final project." />
      <EmptyState title="Projects are locked"><Lock className="mx-auto mb-2 size-5" aria-hidden="true" />Get your required tasks approved ({stage.progress.approvedTasks} of {stage.progress.requiredTasks} so far) to unlock the project step.</EmptyState></>);
  }

  return (
    <>
      <PageHeader title="Projects" description={selected ? `You chose "${selected.title}".` : "Choose one project from your domain, build it in your own GitHub repository, then submit the link for verification."} />

      <Flash flash={sp.flash} />
      {sub?.status === "APPROVED" ? <Alert variant="success" className="mb-6" title="Project verified">Congratulations: your internship is complete. Head to Certificate to get yours.</Alert> : null}
      {sub && ["CHANGES_REQUESTED", "REJECTED"].includes(sub.status) && sub.feedback ? <Alert variant="warning" className="mb-6" title="Reviewer feedback">{sub.feedback}</Alert> : null}

      {!selected ? (
        <div className="grid gap-4 md:grid-cols-2">
          {stage.projects.length === 0 ? <EmptyState title="No projects are published for your internship yet" /> : stage.projects.map((p) => (
            <Card key={p.id}><CardHeader><CardTitle>{p.title}</CardTitle></CardHeader>
              <CardContent className="space-y-3"><p className="whitespace-pre-wrap text-sm text-muted-foreground">{p.description}</p>
                {p.requirements.length ? <ul className="list-disc space-y-1 pl-5 text-sm">{p.requirements.map((r) => <li key={r}>{r}</li>)}</ul> : null}
                <div className="flex flex-wrap gap-1.5">{p.skills.map((s) => <Badge key={s} variant="outline">{s}</Badge>)}</div>
                <ActionForm action={selectProjectAction}><input type="hidden" name="applicationId" value={active.id} /><input type="hidden" name="projectId" value={p.id} /><SubmitButton pendingLabel="Selecting…">Choose this project</SubmitButton></ActionForm>
              </CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <Card><CardHeader><CardTitle>{selected.title}</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
            <p className="whitespace-pre-wrap">{selected.description}</p>
            {selected.requirements.length ? <ul className="list-disc space-y-1 pl-5 text-muted-foreground">{selected.requirements.map((r) => <li key={r}>{r}</li>)}</ul> : null}
            {!sub ? (
              <details className="pt-2"><summary className="cursor-pointer text-primary">Change project</summary><div className="mt-3 space-y-2">
                {stage.projects.filter((p) => p.id !== selected.id).map((p) => (<ActionForm key={p.id} action={selectProjectAction} className="space-y-0"><input type="hidden" name="applicationId" value={active.id} /><input type="hidden" name="projectId" value={p.id} /><SubmitButton variant="outline" size="sm">Switch to {p.title}</SubmitButton></ActionForm>))}
              </div></details>) : null}
          </CardContent></Card>

          <Card className="h-fit"><CardHeader><CardTitle>Submit your repository</CardTitle><CardDescription>{sub ? <StatusBadge value={sub.status} /> : "Not submitted yet"}</CardDescription></CardHeader><CardContent>
            {open ? (<div className="space-y-2 text-sm"><p className="break-all text-muted-foreground">{sub.githubUrl}</p>
              {sub.repoCheckStatus && sub.repoCheckStatus !== "PENDING" ? <p>Repository check: <StatusBadge value={sub.repoCheckStatus} /></p> : null}
              <p>{sub.status === "APPROVED" ? "Verified." : "Waiting for a mentor to verify your project."}</p></div>
            ) : (
              <ActionForm action={submitProjectAction}>
                <input type="hidden" name="applicationId" value={active.id} /><input type="hidden" name="projectId" value={selected.id} />
                <TextField label="GitHub repository link" name="githubUrl" required placeholder="https://github.com/you/project" hint="The repository must be public." defaultValue={sub?.githubUrl} />
                <TextField label="Live demo URL (optional)" name="liveUrl" placeholder="https://" defaultValue={sub?.liveUrl ?? undefined} />
                <TextArea label="Notes for the reviewer" name="notes" rows={3} defaultValue={sub?.notes ?? undefined} />
                <FileField label="Screenshots or documentation (optional)" name="fileIds" purpose="PROJECT_SCREENSHOT" multiple />
                <SubmitButton pendingLabel="Submitting…">{sub ? "Resubmit project" : "Submit project"}</SubmitButton>
              </ActionForm>)}
          </CardContent></Card>
        </div>
      )}
    </>
  );
}
