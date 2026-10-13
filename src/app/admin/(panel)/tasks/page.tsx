import Link from "next/link";

import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { CheckField, SelectField, TextArea, TextField } from "@/components/forms/fields";
import { PageHeader, Table, Td, Th } from "@/components/dashboard/primitives";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStaffPage } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { saveTaskAction } from "@/app/admin/actions";

const localInput = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 16) : "");

export default async function TasksAdmin({ searchParams }: { searchParams: Promise<{ edit?: string; program?: string }> }) {
  await requireStaffPage("tasks.manage");
  const { edit, program } = await searchParams;
  const [programs, domains, tasks] = await Promise.all([
    getPrisma().internshipProgram.findMany({ orderBy: { title: "asc" }, select: { id: true, title: true } }),
    getPrisma().domain.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getPrisma().task.findMany({ where: program ? { programId: program } : {}, orderBy: [{ programId: "asc" }, { sortOrder: "asc" }], take: 200, include: { program: { select: { title: true } }, _count: { select: { assignments: true } } } }),
  ]);
  const t = edit ? await getPrisma().task.findUnique({ where: { id: edit } }) : null;
  return (
    <>
      <PageHeader title="Tasks" description="Publishing a task assigns it to every approved student in that internship." />
      <form className="mb-4"><select name="program" defaultValue={program ?? ""} className="h-10 rounded-md border border-input bg-background px-3 text-sm" aria-label="Filter by internship"><option value="">All internships</option>{programs.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select> <button className="ml-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent">Filter</button></form>
      <Table label="Tasks"><thead><tr><Th>#</Th><Th>Task</Th><Th>Internship</Th><Th>Type</Th><Th>Status</Th><Th>Assigned</Th><Th /></tr></thead><tbody>
        {tasks.map((x) => (<tr key={x.id}><Td>{x.sortOrder}</Td><Td className="font-medium">{x.title}</Td><Td>{x.program.title}</Td><Td>{x.submissionType.replace("_", " ").toLowerCase()}</Td><Td><StatusBadge value={x.status} /></Td><Td>{x._count.assignments}</Td><Td><Link className="text-primary hover:underline" href={`?edit=${x.id}#form`}>Edit</Link></Td></tr>))}</tbody></Table>
      <Card className="mt-8" id="form"><CardHeader><CardTitle>{t ? `Edit: ${t.title}` : "New task"}</CardTitle></CardHeader><CardContent>
        <ActionForm action={saveTaskAction} className="grid gap-5 md:grid-cols-2" key={t?.id ?? "new"}>
          {t ? <input type="hidden" name="id" value={t.id} /> : null}
          <SelectField label="Internship" name="programId" defaultValue={t?.programId ?? program} options={programs.map((x) => ({ value: x.id, label: x.title }))} />
          <SelectField label="Domain (optional: leave blank for all)" name="domainId" defaultValue={t?.domainId ?? ""} options={[{ value: "", label: "All domains" }, ...domains.map((d) => ({ value: d.id, label: d.name }))]} />
          <TextField label="Title" name="title" defaultValue={t?.title} required className="md:col-span-2" />
          <TextArea label="Description" name="description" defaultValue={t?.description} rows={4} required className="md:col-span-2" />
          <TextArea label="Detailed instructions" name="instructions" defaultValue={t?.instructions ?? ""} rows={4} className="md:col-span-2" />
          <SelectField label="Difficulty" name="difficulty" defaultValue={t?.difficulty ?? "BEGINNER"} options={["BEGINNER", "INTERMEDIATE", "ADVANCED"].map((v) => ({ value: v, label: v.toLowerCase() }))} />
          <SelectField label="Submission type" name="submissionType" defaultValue={t?.submissionType ?? "GITHUB_LINK"} options={["GITHUB_LINK", "LIVE_URL", "TEXT", "FILE", "MIXED"].map((v) => ({ value: v, label: v.replace("_", " ").toLowerCase() }))} />
          <TextField label="Deadline" name="deadline" type="datetime-local" defaultValue={localInput(t?.deadline)} />
          <TextField label="Maximum attempts" name="maxAttempts" type="number" min={1} max={10} defaultValue={t?.maxAttempts ?? 3} />
          <TextField label="Points" name="points" type="number" min={0} defaultValue={t?.points ?? 10} />
          <TextField label="Order" name="sortOrder" type="number" min={0} defaultValue={t?.sortOrder ?? 0} />
          <SelectField label="Status" name="status" defaultValue={t?.status ?? "DRAFT"} options={["DRAFT", "PUBLISHED", "ARCHIVED"].map((v) => ({ value: v, label: v.toLowerCase() }))} />
          <CheckField name="requiresGithubLink" label="Require a GitHub link" defaultChecked={t?.requiresGithubLink} />
          <div className="md:col-span-2"><SubmitButton>{t ? "Save changes" : "Create task"}</SubmitButton></div>
        </ActionForm></CardContent></Card>
    </>
  );
}
