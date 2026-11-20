import Link from "next/link";

import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { CheckField, SelectField, TextArea, TextField } from "@/components/forms/fields";
import { PageHeader, Table, Td, Th } from "@/components/dashboard/primitives";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireStaffPage } from "@/lib/auth/guards";
import { difficultyLabel, projectDurationLabel } from "@/lib/difficulty";
import { getPrisma } from "@/lib/db/prisma";
import { isHardTierEnabled } from "@/server/services/settings";
import { saveProjectAction } from "@/app/admin/actions";

export default async function ProjectsAdmin({ searchParams }: { searchParams: Promise<{ edit?: string; q?: string }> }) {
  await requireStaffPage("projects.manage");
  const { edit, q } = await searchParams;
  const query = q?.trim();
  const [programs, projects] = await Promise.all([
    getPrisma().internshipProgram.findMany({ orderBy: { title: "asc" }, select: { id: true, title: true } }),
    getPrisma().project.findMany({
      where: query ? { OR: [
        { title: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
        { skills: { has: query } },
        { program: { title: { contains: query, mode: "insensitive" } } },
      ] } : undefined,
      orderBy: [{ programId: "asc" }, { sortOrder: "asc" }],
      include: { program: { select: { title: true } }, _count: { select: { submissions: true } } },
    }),
  ]);
  const p = edit ? projects.find((x) => x.id === edit) : undefined;
  return (
    <>
      <PageHeader title="Projects" description="Students choose one published project after finishing their tasks." />
      <form role="search" className="mb-4 flex max-w-lg gap-2"><Input type="search" name="q" defaultValue={q} placeholder="Search projects or internships…" aria-label="Search projects" /><SubmitButton>Search</SubmitButton></form>
      <Table label="Projects"><thead><tr><Th>Project</Th><Th>Internship</Th><Th>Difficulty</Th><Th>Estimated time</Th><Th>Status</Th><Th>Submissions</Th><Th /></tr></thead><tbody>
        {projects.map((x) => (<tr key={x.id}><Td className="font-medium">{x.title}</Td><Td>{x.program.title}</Td><Td>{difficultyLabel(x.difficulty)}</Td><Td>{projectDurationLabel(x.difficulty)}</Td><Td><StatusBadge value={x.status} /></Td><Td>{x._count.submissions}</Td><Td><Link className="text-primary hover:underline" href={`?edit=${x.id}#form`}>Edit</Link></Td></tr>))}</tbody></Table>
      <Card className="mt-8" id="form"><CardHeader><CardTitle>{p ? `Edit: ${p.title}` : "New project"}</CardTitle></CardHeader><CardContent>
        <ActionForm action={saveProjectAction} className="grid gap-5 md:grid-cols-2" key={p?.id ?? "new"}>
          {p ? <input type="hidden" name="id" value={p.id} /> : null}
          <SelectField label="Internship" name="programId" defaultValue={p?.programId} options={programs.map((x) => ({ value: x.id, label: x.title }))} className="md:col-span-2" />
          <TextField label="Title" name="title" defaultValue={p?.title} required className="md:col-span-2" />
          <TextArea label="Description" name="description" defaultValue={p?.description} rows={4} required className="md:col-span-2" />
          <TextArea label="Requirements (one per line)" name="requirements" defaultValue={p?.requirements.join("\n")} rows={4} />
          <TextArea label="Skills (one per line)" name="skills" defaultValue={p?.skills.join("\n")} rows={4} />
          <TextField label="Maximum project marks" name="maxScore" type="number" min={1} max={1000} step={1} defaultValue={p?.maxScore ?? 100} />
          <TextField label="Order" name="sortOrder" type="number" min={0} defaultValue={p?.sortOrder ?? 0} />
          <SelectField label="Status" name="status" defaultValue={p?.status ?? "DRAFT"} options={["DRAFT", "PUBLISHED", "ARCHIVED"].map((v) => ({ value: v, label: v.toLowerCase() }))} />
          <CheckField name="requiresLiveUrl" label="Require a live URL" defaultChecked={p?.requiresLiveUrl} />
          <SelectField
            label="Difficulty"
            name="difficulty"
            defaultValue={p?.difficulty}
            options={[
              { value: "BEGINNER", label: "Easy" },
              { value: "INTERMEDIATE", label: "Medium" },
              ...(await isHardTierEnabled() ? [{ value: "ADVANCED", label: "Hard" }] : []),
            ]}
          />
          <p className="self-center text-sm text-muted-foreground">Estimated effort follows difficulty: Easy 3–5 days, Medium 1–2 weeks, Hard 2–4 weeks.</p>
          <div className="md:col-span-2"><SubmitButton>{p ? "Save changes" : "Create project"}</SubmitButton></div>
        </ActionForm></CardContent></Card>
    </>
  );
}
