import Link from "next/link";

import { EmptyState, PageHeader, Table, Td, Th } from "@/components/dashboard/primitives";
import { Pagination, parsePaging } from "@/components/dashboard/pagination";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { requireStaffPage } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { formatDateTime } from "@/lib/utils/format";
import { humaniseEnumValue } from "@/lib/utils/text";

export default async function SecurityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaffPage("security.view");
  const { page, size, skip, one } = parsePaging(await searchParams);
  const view = one("view") === "audit" ? "audit" : "events";
  const prisma = getPrisma();
  const [events, eventTotal, logs, logTotal, failedJobs, byType] = await Promise.all([
    view === "events" ? prisma.securityEvent.findMany({ orderBy: { createdAt: "desc" }, skip, take: size }) : Promise.resolve([]),
    prisma.securityEvent.count(),
    view === "audit" ? prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, skip, take: size, include: { actor: { select: { email: true } } } }) : Promise.resolve([]),
    prisma.auditLog.count(),
    prisma.backgroundJob.count({ where: { status: "FAILED" } }),
    prisma.securityEvent.groupBy({ by: ["type"], where: { createdAt: { gte: new Date(Date.now() - 86_400_000) } }, _count: { _all: true } }),
  ]);
  const tab = (key: string, label: string) => <Link href={`?view=${key}`} className={`rounded-full border px-3 py-1 text-sm ${view === key ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent"}`}>{label}</Link>;
  return (
    <>
      <PageHeader title="Security" description={`Last 24 hours: ${byType.map((t) => `${humaniseEnumValue(t.type).toLowerCase()} ${t._count._all}`).join(", ") || "no events"}. Failed background jobs: ${failedJobs}.`} />
      <div className="mb-4 flex gap-2">{tab("events", `Security events (${eventTotal})`)}{tab("audit", `Audit log (${logTotal})`)}</div>
      {view === "events" ? (events.length === 0 ? <EmptyState title="No security events" /> : (
        <Table label="Security events"><thead><tr><Th>When</Th><Th>Type</Th><Th>Severity</Th><Th>Email</Th><Th>IP</Th><Th>Detail</Th></tr></thead><tbody>
          {events.map((e) => (<tr key={e.id}><Td className="whitespace-nowrap">{formatDateTime(e.createdAt)}</Td><Td>{humaniseEnumValue(e.type)}</Td><Td><StatusBadge value={e.severity} /></Td><Td>{e.email ?? "-"}</Td><Td className="font-mono text-xs">{e.ipAddress ?? "-"}</Td><Td className="max-w-xs break-words font-mono text-xs">{e.detail ? JSON.stringify(e.detail) : ""}</Td></tr>))}</tbody></Table>))
      : (
        <Table label="Audit log"><thead><tr><Th>When</Th><Th>Actor</Th><Th>Action</Th><Th>Entity</Th><Th>IP</Th><Th>Detail</Th></tr></thead><tbody>
          {logs.map((l) => (<tr key={l.id}><Td className="whitespace-nowrap">{formatDateTime(l.createdAt)}</Td><Td>{l.actor?.email ?? l.actorRole ?? "system"}</Td><Td>{humaniseEnumValue(l.action)}</Td><Td className="text-xs">{l.entityType}</Td><Td className="font-mono text-xs">{l.ipAddress ?? "-"}</Td><Td className="max-w-xs break-words font-mono text-xs">{l.metadata ? JSON.stringify(l.metadata) : ""}</Td></tr>))}</tbody></Table>)}
      <Pagination base="/admin/security" params={{ view }} page={page} size={size} total={view === "events" ? eventTotal : logTotal} />
    </>
  );
}
