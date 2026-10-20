
import { Flash } from "@/components/dashboard/flash";
import { Lock } from "lucide-react";

import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { TextArea, TextField } from "@/components/forms/fields";
import {
  EmptyState,
  PageHeader,
} from "@/components/dashboard/primitives";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  difficultyLabel,
  groupProjectsByDifficulty,
} from "@/lib/difficulty";
import { requireStudentPage } from "@/lib/auth/guards";
import { getActiveApplication } from "@/server/services/applications";
import { getProjectStage } from "@/server/services/projects";
import { isHardTierEnabled } from "@/server/services/settings";
import {
  selectProjectAction,
  submitProjectAction,
} from "@/app/student/actions";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ app?: string; flash?: string }>;
}) {
  const student = await requireStudentPage();
  const sp = await searchParams;

  const { active } = await getActiveApplication(
    student.userId,
    sp.app,
  );

  if (!active) {
    return (
      <>
        <PageHeader title="Projects" />
        <EmptyState title="Projects appear after your application is approved" />
      </>
    );
  }

  const stage = await getProjectStage(student.userId, active.id);
  const hardTierEnabled = await isHardTierEnabled();

  const selected =
    stage.projects.find(
      (project) => project.id === active.selectedProjectId,
    ) ?? null;

  const sub = stage.submission;

  const open =
    sub &&
    ["SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(sub.status);

  // Hide Hard projects from the selection list when the tier is disabled.
  const visibleProjects = stage.projects.filter(
    (project) =>
      hardTierEnabled || project.difficulty !== "ADVANCED",
  );

  const { groups } = groupProjectsByDifficulty(
    visibleProjects,
    hardTierEnabled,
  );

  if (!stage.unlocked) {
    return (
      <>
        <PageHeader
          title="Projects"
          description="Your final project."
        />
        <EmptyState title="Projects are locked">
          <Lock
            className="mx-auto mb-2 size-5"
            aria-hidden="true"
          />
          Get your required tasks approved (
          {stage.progress.approvedTasks} of{" "}
          {stage.progress.requiredTasks} so far) to unlock the
          project step.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Projects"
        description={
          selected
            ? `You chose "${selected.title}".`
            : "Choose one project from your domain, build it in your own GitHub repository, then submit the link for verification."
        }
      />

      <Flash flash={sp.flash} />

      {sub?.status === "APPROVED" ? (
        <Alert
          variant="success"
          className="mb-6"
          title="Project verified"
        >
          Congratulations: your internship is complete. Head to
          Certificate to get yours.
        </Alert>
      ) : null}

      {sub &&
      ["CHANGES_REQUESTED", "REJECTED"].includes(sub.status) &&
      sub.feedback ? (
        <Alert
          variant="warning"
          className="mb-6"
          title="Reviewer feedback"
        >
          {sub.feedback}
        </Alert>
      ) : null}

      {!selected ? (
        <div className="space-y-8">
          {visibleProjects.length === 0 ? (
            <EmptyState title="No projects are published for your internship yet" />
          ) : (
            <>
              {groups.easy.length > 0 ? (
                <section className="space-y-4">
                  <div>
                    <h2 className="text-xl font-semibold">
                      Easy Projects
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Beginner-friendly projects to get started.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {groups.easy.map((project) => (
                      <Card key={project.id}>
                        <CardHeader>
                          <CardTitle>{project.title}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                            {project.description}
                          </p>

                          {project.requirements.length > 0 ? (
                            <ul className="list-disc space-y-1 pl-5 text-sm">
                              {project.requirements.map((requirement) => (
                                <li key={requirement}>
                                  {requirement}
                                </li>
                              ))}
                            </ul>
                          ) : null}

                          <div className="flex flex-wrap gap-1.5">
                            {project.skills.map((skill) => (
                              <Badge key={skill} variant="outline">
                                {skill}
                              </Badge>
                            ))}
                          </div>

                          <Badge variant="outline">
                            {difficultyLabel(project.difficulty)}
                          </Badge>

                          <ActionForm action={selectProjectAction}>
                            <input
                              type="hidden"
                              name="applicationId"
                              value={active.id}
                            />
                            <input
                              type="hidden"
                              name="projectId"
                              value={project.id}
                            />
                            <SubmitButton pendingLabel="Selecting…">
                              Choose this project
                            </SubmitButton>
                          </ActionForm>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </section>
              ) : null}

              {groups.medium.length > 0 ? (
                <section className="space-y-4">
                  <div>
                    <h2 className="text-xl font-semibold">
                      Medium Projects
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Projects with broader scope and more deliverables.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {groups.medium.map((project) => (
                      <Card key={project.id}>
                        <CardHeader>
                          <CardTitle>{project.title}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                            {project.description}
                          </p>

                          {project.requirements.length > 0 ? (
                            <ul className="list-disc space-y-1 pl-5 text-sm">
                              {project.requirements.map((requirement) => (
                                <li key={requirement}>
                                  {requirement}
                                </li>
                              ))}
                            </ul>
                          ) : null}

                          <div className="flex flex-wrap gap-1.5">
                            {project.skills.map((skill) => (
                              <Badge key={skill} variant="outline">
                                {skill}
                              </Badge>
                            ))}
                          </div>

                          <Badge variant="outline">
                            {difficultyLabel(project.difficulty)}
                          </Badge>

                          <ActionForm action={selectProjectAction}>
                            <input
                              type="hidden"
                              name="applicationId"
                              value={active.id}
                            />
                            <input
                              type="hidden"
                              name="projectId"
                              value={project.id}
                            />
                            <SubmitButton pendingLabel="Selecting…">
                              Choose this project
                            </SubmitButton>
                          </ActionForm>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </section>
              ) : null}

              {hardTierEnabled && groups.hard.length > 0 ? (
                <section className="space-y-4">
                  <div>
                    <h2 className="text-xl font-semibold">
                      Hard Projects
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Advanced projects with production-level expectations.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {groups.hard.map((project) => (
                      <Card key={project.id}>
                        <CardHeader>
                          <CardTitle>{project.title}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                            {project.description}
                          </p>

                          {project.requirements.length > 0 ? (
                            <ul className="list-disc space-y-1 pl-5 text-sm">
                              {project.requirements.map((requirement) => (
                                <li key={requirement}>
                                  {requirement}
                                </li>
                              ))}
                            </ul>
                          ) : null}

                          <div className="flex flex-wrap gap-1.5">
                            {project.skills.map((skill) => (
                              <Badge key={skill} variant="outline">
                                {skill}
                              </Badge>
                            ))}
                          </div>

                          <Badge variant="outline">
                            {difficultyLabel(project.difficulty)}
                          </Badge>

                          <ActionForm action={selectProjectAction}>
                            <input
                              type="hidden"
                              name="applicationId"
                              value={active.id}
                            />
                            <input
                              type="hidden"
                              name="projectId"
                              value={project.id}
                            />
                            <SubmitButton pendingLabel="Selecting…">
                              Choose this project
                            </SubmitButton>
                          </ActionForm>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>{selected.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="whitespace-pre-wrap">
                {selected.description}
              </p>

              {selected.requirements.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  {selected.requirements.map((requirement) => (
                    <li key={requirement}>{requirement}</li>
                  ))}
                </ul>
              ) : null}

              {!sub ? (
                <details className="pt-2">
                  <summary className="cursor-pointer text-primary">
                    Change project
                  </summary>
                  <div className="mt-3 space-y-2">
                    {visibleProjects
                      .filter((project) => project.id !== selected.id)
                      .map((project) => (
                        <ActionForm
                          key={project.id}
                          action={selectProjectAction}
                          className="space-y-0"
                        >
                          <input
                            type="hidden"
                            name="applicationId"
                            value={active.id}
                          />
                          <input
                            type="hidden"
                            name="projectId"
                            value={project.id}
                          />
                          <SubmitButton variant="outline" size="sm">
                            Switch to {project.title}
                          </SubmitButton>
                        </ActionForm>
                      ))}
                  </div>
                </details>
              ) : null}
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Submit your repository</CardTitle>
              <CardDescription>
                {sub ? (
                  <StatusBadge value={sub.status} />
                ) : (
                  "Not submitted yet"
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {open ? (
                <div className="space-y-2 text-sm">
                  <p className="break-all text-muted-foreground">
                    {sub.githubUrl}
                  </p>

                  {sub.repoCheckStatus &&
                  sub.repoCheckStatus !== "PENDING" ? (
                    <p>
                      Repository check:{" "}
                      <StatusBadge value={sub.repoCheckStatus} />
                    </p>
                  ) : null}

                  <p>
                    {sub.status === "APPROVED"
                      ? "Verified."
                      : "Waiting for a mentor to verify your project."}
                  </p>
                </div>
              ) : (
                <ActionForm action={submitProjectAction}>
                  <input
                    type="hidden"
                    name="applicationId"
                    value={active.id}
                  />
                  <input
                    type="hidden"
                    name="projectId"
                    value={selected.id}
                  />

                  <TextField
                    label="GitHub repository link"
                    name="githubUrl"
                    required
                    placeholder="https://github.com/you/project"
                    hint="The repository must be public."
                    defaultValue={sub?.githubUrl}
                  />

                  <TextField
                    label="Live demo URL"
                    name="liveUrl"
                    required
                    placeholder="https://"
                    hint="A public https:// URL to your deployed project."
                    defaultValue={sub?.liveUrl ?? undefined}
                  />

                  <TextArea
                    label="Notes for the reviewer"
                    name="notes"
                    rows={3}
                    defaultValue={sub?.notes ?? undefined}
                  />

                  <SubmitButton pendingLabel="Submitting…">
                    {sub ? "Resubmit project" : "Submit project"}
                  </SubmitButton>
                </ActionForm>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
