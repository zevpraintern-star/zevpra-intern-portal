import { Flash } from "@/components/dashboard/flash";
import Link from "next/link";

import { EmptyState, PageHeader, Table, Td, Th } from "@/components/dashboard/primitives";
import { Pagination, parsePaging } from "@/components/dashboard/pagination";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import { can, requireStaffPage } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { formatDateTime, formatPrice } from "@/lib/utils/format";

const TABS = ["UNDER_REVIEW", "APPROVED", "REJECTED", "NOT_SUBMITTED"] as const;

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaffPage("payments.view");
  const params = await searchParams;
  const { page, size, skip, one } = parsePaging(params);
  const flash = one("flash");
  const status = (TABS as readonly string[]).includes(one("status") ?? "") ? (one("status") as (typeof TABS)[number]) : "UNDER_REVIEW";
  const [rows, total] = await Promise.all([
    getPrisma().paymentRequest.findMany({ where: { status }, orderBy: { submittedAt: "asc" }, skip, take: size, include: { student: { select: { name: true, email: true } }, program: { select: { title: true } } } }),
    getPrisma().paymentRequest.count({ where: { status } }),
  ]);
  return (
    <>
      <Flash flash={flash} />
      <PageHeader title="Payments" description="Manual UPI verification. Nothing is issued until you approve." actions={can(staff, "payments.view") ? <Button asChild variant="outline"><a href="/api/admin/export/payments">Export CSV</a></Button> : undefined} />
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Payment status">
        {TABS.map((t) => <Link key={t} role="tab" aria-selected={t === status} href={`?status=${t}`} className={`rounded-full border px-3 py-1 text-sm ${t === status ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent"}`}>{t.replaceAll("_", " ").toLowerCase()}</Link>)}
      </div>
      {rows.length === 0 ? <EmptyState title="Nothing here" /> : (
        <Table label="Payments"><thead><tr><Th>Student</Th><Th>Email</Th><Th>Internship</Th><Th>Amount</Th><Th>UTR</Th><Th>Submitted</Th><Th>Status</Th><Th /></tr></thead><tbody>
          {rows.map((p) => (<tr key={p.id}><Td>{p.student.name}</Td><Td>{p.student.email}</Td><Td>{p.program.title}</Td><Td>{formatPrice(Number(p.amount), p.currency)}</Td><Td className="font-mono text-xs">{p.utr ?? "-"}</Td><Td>{p.submittedAt ? formatDateTime(p.submittedAt) : "-"}</Td><Td><StatusBadge value={p.status} /></Td><Td><Link className="text-primary hover:underline" href={`/admin/payments/${p.id}`}>Open</Link></Td></tr>))}</tbody></Table>)}
      <Pagination base="/admin/payments" params={{ status }} page={page} size={size} total={total} />
    </>
  );
}
