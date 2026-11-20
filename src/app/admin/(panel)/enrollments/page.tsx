import Link from "next/link";

import { EmptyState, PageHeader, Table, Td, Th } from "@/components/dashboard/primitives";
import { Pagination, parsePaging } from "@/components/dashboard/pagination";
import { Input } from "@/components/ui/input";
import type { Prisma } from "@/generated/prisma/client";
import type { EnrollmentStatus } from "@/generated/prisma/enums";
import { requireStaffPage } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { formatDate } from "@/lib/utils/format";

export default async function EnrollmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaffPage("students.view");
  const params = await searchParams;
  const { page, size, skip, one } = parsePaging(params);
  const status: EnrollmentStatus = one("status") === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS";
  const q = one("q")?.trim().slice(0, 80);
  const where: Prisma.ApplicationWhereInput = {
    status: "APPROVED" as const,
    completionStatus: status,
    ...(q ? { OR: [
      { student: { is: { name: { contains: q, mode: "insensitive" as const } } } },
      { student: { is: { email: { contains: q, mode: "insensitive" as const } } } },
      { student: { is: { studentProfile: { is: { fullName: { contains: q, mode: "insensitive" as const } } } } } },
      { student: { is: { studentProfile: { is: { college: { contains: q, mode: "insensitive" as const } } } } } },
      { program: { is: { title: { contains: q, mode: "insensitive" as const } } } },
      { domain: { is: { name: { contains: q, mode: "insensitive" as const } } } },
    ] } : {}),
  };
  const prisma = getPrisma();
  const [rows, total] = await Promise.all([
    prisma.application.findMany({
      where,
      orderBy: status === "COMPLETED" ? { completedAt: "desc" } : { startedAt: "desc" },
      skip,
      take: size,
      select: {
        id: true, startedAt: true, completedAt: true, progressPercent: true,
        student: { select: { id: true, name: true, email: true, studentProfile: { select: { fullName: true, college: true, branch: true } } } },
        program: { select: { title: true } },
        domain: { select: { name: true } },
      },
    }),
    prisma.application.count({ where }),
  ]);
  const title = status === "COMPLETED" ? "Completed internships" : "Active internships";
  const tab = (value: string, label: string) => (
    <Link href={`/admin/enrollments?status=${value}${q ? `&q=${encodeURIComponent(q)}` : ""}`} aria-current={status === value ? "page" : undefined}
      className={`rounded-full border px-3 py-1 text-sm ${status === value ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent"}`}>{label}</Link>
  );

  return (
    <>
      <PageHeader title={title} description={`${total} ${status === "COMPLETED" ? "completed enrollments" : "students currently doing an internship"}.`} />
      <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Enrollment status">
        {tab("IN_PROGRESS", "Active internships")}
        {tab("COMPLETED", "Completed internships")}
      </div>
      <form role="search" className="mb-4 flex max-w-lg gap-2">
        <Input type="search" name="q" defaultValue={q} placeholder="Search student, college, internship, domain…" aria-label="Search enrollments" />
        <input type="hidden" name="status" value={status} />
        <button type="submit" className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent">Search</button>
      </form>
      {rows.length === 0 ? <EmptyState title={q ? "No matching enrollments" : `No ${status === "COMPLETED" ? "completed" : "active"} internships`} /> : (
        <Table label={title}>
          <thead><tr><Th>Student</Th><Th>Email</Th><Th>College / branch</Th><Th>Internship</Th><Th>Domain</Th>{status === "COMPLETED" ? <Th>Completed</Th> : <><Th>Started</Th><Th>Progress</Th></>}</tr></thead>
          <tbody>{rows.map((row) => {
            const profile = row.student.studentProfile;
            return <tr key={row.id}>
              <Td><Link className="font-medium text-primary hover:underline" href={`/admin/students/${row.student.id}`}>{profile?.fullName ?? row.student.name ?? row.student.email}</Link></Td>
              <Td>{row.student.email}</Td>
              <Td>{[profile?.college, profile?.branch].filter(Boolean).join(" · ") || "-"}</Td>
              <Td>{row.program.title}</Td><Td>{row.domain.name}</Td>
              {status === "COMPLETED" ? <Td>{row.completedAt ? formatDate(row.completedAt) : "-"}</Td> : <><Td>{row.startedAt ? formatDate(row.startedAt) : "-"}</Td><Td>{row.progressPercent}%</Td></>}
            </tr>;
          })}</tbody>
        </Table>
      )}
      <Pagination base="/admin/enrollments" params={{ status, q }} page={page} size={size} total={total} />
    </>
  );
}
