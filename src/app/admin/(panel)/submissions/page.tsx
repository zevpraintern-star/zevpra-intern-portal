import { Flash } from "@/components/dashboard/flash";
import Link from "next/link";

import { EmptyState, PageHeader, Table, Td, Th } from "@/components/dashboard/primitives";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { can, requireStaffPage } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { formatDateTime } from "@/lib/utils/format";

export default async function SubmissionsQueue({ searchParams }: { searchParams: Promise<{ flash?: string }> }) {
  const { flash } = await searchParams;
  const staff = await requireStaffPage("tasks.review");
  const open = { in: ["SUBMITTED", "UNDER_REVIEW"] as ("SUBMITTED" | "UNDER_REVIEW")[] };
  const [tasks, projects] = await Promise.all([
    getPrisma().taskSubmission.findMany({ where: { status: open }, orderBy: { submittedAt: "asc" }, take: 100, include: { task: { select: { title: true } }, student: { select: { name: true, email: true } } } }),
    can(staff, "projects.review") ? getPrisma().projectSubmission.findMany({ where: { status: open }, orderBy: { submittedAt: "asc" }, take: 100, include: { project: { select: { title: true } }, student: { select: { name: true, email: true } } } }) : Promise.resolve([]),
  ]);
  return (
    <>
      <Flash flash={flash} />
      <PageHeader title="Submissions to review" description="Oldest first." />
      {projects.length > 0 ? <><h2 className="mb-2 font-display text-lg font-semibold">Final projects</h2>
        <Table label="Project submissions"><thead><tr><Th>Student</Th><Th>Project</Th><Th>Repository check</Th><Th>Submitted</Th><Th /></tr></thead><tbody>
          {projects.map((p) => (<tr key={p.id}><Td>{p.student.name ?? p.student.email}</Td><Td>{p.project.title}</Td><Td><StatusBadge value={p.repoCheckStatus} /></Td><Td>{formatDateTime(p.submittedAt)}</Td><Td><Link className="text-primary hover:underline" href={`/admin/submissions/project/${p.id}`}>Review</Link></Td></tr>))}</tbody></Table></> : null}
      <h2 className="mb-2 mt-8 font-display text-lg font-semibold">Tasks</h2>
      {tasks.length === 0 ? <EmptyState title="No task submissions waiting" /> : <Table label="Task submissions"><thead><tr><Th>Student</Th><Th>Task</Th><Th>Attempt</Th><Th>Submitted</Th><Th /></tr></thead><tbody>
        {tasks.map((t) => (<tr key={t.id}><Td>{t.student.name ?? t.student.email}</Td><Td>{t.task.title}</Td><Td>{t.attemptNumber}</Td><Td>{formatDateTime(t.submittedAt)}</Td><Td><Link className="text-primary hover:underline" href={`/admin/submissions/task/${t.id}`}>Review</Link></Td></tr>))}</tbody></Table>}
    </>
  );
}
