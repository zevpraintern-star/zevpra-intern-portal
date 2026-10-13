import Link from "next/link";

import { PageHeader, Table, Td, Th } from "@/components/dashboard/primitives";
import { Pagination, parsePaging } from "@/components/dashboard/pagination";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { can, requireStaffPage } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { formatDate } from "@/lib/utils/format";
import { listStudents } from "@/server/services/admin";

const select = "h-10 rounded-md border border-input bg-background px-3 text-sm";

export default async function StudentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaffPage("students.view");
  const params = await searchParams;
  const { page, size, skip, one } = parsePaging(params);
  const filter = { q: one("q"), accountStatus: one("status"), domainId: one("domain"), applicationStatus: one("app"), sort: one("sort"), dir: one("dir") };
  const [{ rows, total }, domains] = await Promise.all([listStudents(filter, skip, size), getPrisma().domain.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })]);
  const qs = new URLSearchParams(Object.entries({ q: filter.q, status: filter.accountStatus, domain: filter.domainId, app: filter.applicationStatus }).filter(([, v]) => v) as [string, string][]).toString();
  const sortLink = (key: string, label: string) => { const next = filter.sort === key && filter.dir !== "asc" ? "asc" : "desc"; const q = new URLSearchParams(qs); q.set("sort", key); q.set("dir", next); return <Link href={`?${q}`} className="hover:text-foreground">{label}{filter.sort === key ? (filter.dir === "asc" ? " ↑" : " ↓") : ""}</Link>; };

  return (
    <>
      <PageHeader title="Students" description={`${total} matching`} actions={can(staff, "students.export") ? <Button asChild variant="outline"><a href={`/api/admin/export/students${qs ? `?${qs}` : ""}`}>Export CSV</a></Button> : undefined} />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <Input name="q" defaultValue={filter.q} placeholder="Search name, email, college, mobile" className="max-w-xs" aria-label="Search students" />
        <select name="domain" defaultValue={filter.domainId ?? ""} className={select} aria-label="Domain"><option value="">All domains</option>{domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <select name="app" defaultValue={filter.applicationStatus ?? ""} className={select} aria-label="Application status"><option value="">Any application</option>{["PENDING", "APPROVED", "REJECTED", "WITHDRAWN"].map((s) => <option key={s}>{s}</option>)}</select>
        <select name="status" defaultValue={filter.accountStatus ?? ""} className={select} aria-label="Account status"><option value="">Any account</option><option>ACTIVE</option><option>SUSPENDED</option></select>
        <input type="hidden" name="size" value={size} /><Button type="submit">Filter</Button>
      </form>
      <Table label="Students">
        <thead><tr><Th>{sortLink("name", "Name")}</Th><Th>Email</Th><Th>{sortLink("college", "College")}</Th><Th>{sortLink("branch", "Branch")}</Th><Th>{sortLink("year", "Year")}</Th><Th>Domain</Th><Th>Application</Th><Th>Internship</Th><Th>{sortLink("joined", "Joined")}</Th></tr></thead>
        <tbody>
          {rows.length === 0 ? <tr><Td className="text-center text-muted-foreground" >No students match.</Td></tr> : rows.map((s) => { const a = s.user.applications[0]; return (
            <tr key={s.id}><Td><Link className="font-medium text-primary hover:underline" href={`/admin/students/${s.user.id}`}>{s.fullName}</Link>{s.user.status === "SUSPENDED" ? <span className="ml-2"><StatusBadge value="SUSPENDED" /></span> : null}</Td><Td>{s.user.email}</Td><Td>{s.college}</Td><Td>{s.branch}</Td><Td>{s.yearOfStudy}</Td><Td>{a?.domain.name ?? "-"}</Td><Td><StatusBadge value={a?.status} /></Td><Td><StatusBadge value={a?.completionStatus} /></Td><Td>{formatDate(s.createdAt)}</Td></tr>); })}
        </tbody>
      </Table>
      <Pagination base="/admin/students" params={{ q: filter.q, status: filter.accountStatus, domain: filter.domainId, app: filter.applicationStatus, sort: filter.sort, dir: filter.dir }} page={page} size={size} total={total} />
    </>
  );
}
