import Link from "next/link";

import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { CheckField, SelectField, TextArea, TextField } from "@/components/forms/fields";
import { PageHeader, Table, Td, Th } from "@/components/dashboard/primitives";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStaffPage } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { saveProgramAction } from "@/app/admin/actions";

const dayInput = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

export default async function ProgramsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireStaffPage("programs.manage");
  const { edit } = await searchParams;
  const [programs, domains] = await Promise.all([
    getPrisma().internshipProgram.findMany({ orderBy: { createdAt: "desc" }, include: { domain: { select: { name: true } }, _count: { select: { applications: true, tasks: true, projects: true } } } }),
    getPrisma().domain.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const p = edit ? programs.find((x) => x.id === edit) : undefined;
  const diff = [{ value: "BEGINNER", label: "Beginner" }, { value: "INTERMEDIATE", label: "Intermediate" }, { value: "ADVANCED", label: "Advanced" }];
  return (
    <>
      <PageHeader title="Internships" description="Create and publish the programs students apply to." />
      <Table label="Internships"><thead><tr><Th>Title</Th><Th>Domain</Th><Th>Status</Th><Th>Applications</Th><Th>Tasks</Th><Th>Projects</Th><Th /></tr></thead><tbody>
        {programs.map((x) => (<tr key={x.id}><Td className="font-medium">{x.title}</Td><Td>{x.domain.name}</Td><Td><StatusBadge value={x.status} /></Td><Td>{x._count.applications}</Td><Td>{x._count.tasks}</Td><Td>{x._count.projects}</Td><Td><Link className="text-primary hover:underline" href={`?edit=${x.id}#form`}>Edit</Link></Td></tr>))}</tbody></Table>
      <Card className="mt-8" id="form"><CardHeader><CardTitle>{p ? `Edit: ${p.title}` : "New internship"}</CardTitle></CardHeader><CardContent>
        <ActionForm action={saveProgramAction} className="grid gap-5 md:grid-cols-2" key={p?.id ?? "new"}>
          {p ? <input type="hidden" name="id" value={p.id} /> : null}
          <TextField label="Title" name="title" defaultValue={p?.title} required className="md:col-span-2" />
          <SelectField label="Domain" name="domainId" defaultValue={p?.domainId} options={domains.map((d) => ({ value: d.id, label: d.name }))} />
          <SelectField label="Difficulty" name="difficulty" defaultValue={p?.difficulty ?? "BEGINNER"} options={diff} />
          <TextArea label="Summary (shown on cards)" name="summary" defaultValue={p?.summary} rows={2} required className="md:col-span-2" />
          <TextArea label="Full description" name="description" defaultValue={p?.description ?? ""} rows={5} className="md:col-span-2" />
          <TextField label="Duration (weeks)" name="durationWeeks" type="number" min={1} max={52} defaultValue={p?.durationWeeks ?? 8} required />
          <SelectField label="Status" name="status" defaultValue={p?.status ?? "DRAFT"} options={["DRAFT", "PUBLISHED", "CLOSED", "ARCHIVED"].map((s) => ({ value: s, label: s.toLowerCase() }))} />
          <TextField label="Start date" name="startDate" type="date" defaultValue={dayInput(p?.startDate)} />
          <TextField label="End / application deadline" name="endDate" type="date" defaultValue={dayInput(p?.endDate)} />
          <TextArea label="Skills (one per line)" name="skills" defaultValue={p?.skills.join("\n")} rows={3} />
          <TextArea label="Prerequisites (one per line)" name="prerequisites" defaultValue={p?.prerequisites.join("\n")} rows={3} />
          <TextArea label="Learning outcomes (one per line)" name="learningOutcomes" defaultValue={p?.learningOutcomes.join("\n")} rows={3} />
          <TextArea label="Certificate requirements" name="certificateRequirements" defaultValue={p?.certificateRequirements ?? ""} rows={3} />
          <TextField label="Minimum approved tasks to unlock the project (0 = all)" name="minTasksForCompletion" type="number" min={0} defaultValue={p?.minTasksForCompletion ?? 0} />
          <CheckField name="isFeatured" label="Feature on the homepage" defaultChecked={p?.isFeatured} />
          <div className="md:col-span-2"><SubmitButton>{p ? "Save changes" : "Create internship"}</SubmitButton></div>
        </ActionForm></CardContent></Card>
    </>
  );
}
