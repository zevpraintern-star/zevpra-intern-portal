import { Flash } from "@/components/dashboard/flash";
import Link from "next/link";

import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { TextField } from "@/components/forms/fields";
import { EmptyState, PageHeader, Table, Td, Th } from "@/components/dashboard/primitives";
import { Pagination, parsePaging } from "@/components/dashboard/pagination";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { can, requireStaffPage } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { formatDate } from "@/lib/utils/format";
import { revokeCertificateAction } from "@/app/admin/actions";

export default async function CertificatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaffPage("certificates.issue");
  const { page, size, skip, one } = parsePaging(await searchParams);
  const q = one("q")?.trim().slice(0, 60);
  const flash = one("flash");
  const where = q ? { OR: [{ certificateId: { contains: q.toUpperCase() } }, { snapshotStudentName: { contains: q, mode: "insensitive" as const } }] } : {};
  const [rows, total] = await Promise.all([getPrisma().certificate.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: size }), getPrisma().certificate.count({ where })]);
  return (
    <>
      <Flash flash={flash} />
      <PageHeader title="Certificates" description={`${total} total`} actions={<Button asChild variant="outline"><a href="/api/admin/export/certificates">Export CSV</a></Button>} />
      <form className="mb-4" role="search"><Input name="q" defaultValue={q} placeholder="Search certificate ID or student" className="max-w-xs" aria-label="Search certificates" /></form>
      {rows.length === 0 ? <EmptyState title="No certificates" /> : (
        <Table label="Certificates"><thead><tr><Th>Certificate ID</Th><Th>Student</Th><Th>Internship</Th><Th>Issued</Th><Th>Status</Th><Th /></tr></thead><tbody>
          {rows.map((c) => (<tr key={c.id}><Td className="font-mono text-xs"><Link className="text-primary hover:underline" href={`/verify-certificate/${c.verificationId}`} target="_blank">{c.certificateId}</Link></Td><Td>{c.snapshotStudentName}</Td><Td>{c.snapshotProgramTitle}</Td><Td>{c.issueDate ? formatDate(c.issueDate) : "-"}</Td><Td><StatusBadge value={c.status} /></Td>
            <Td>{c.status !== "REVOKED" && can(staff, "certificates.revoke") ? <details><summary className="cursor-pointer text-destructive">Revoke</summary><ActionForm action={revokeCertificateAction} className="mt-2 w-64"><input type="hidden" name="certificateId" value={c.id} /><TextField label="Reason" name="reason" required /><SubmitButton variant="destructive" size="sm">Confirm revoke</SubmitButton></ActionForm></details> : null}</Td></tr>))}</tbody></Table>)}
      <Pagination base="/admin/certificates" params={{ q }} page={page} size={size} total={total} />
    </>
  );
}
