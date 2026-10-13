import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";

/** Aggregate counts only: the dashboard never loads individual student records. */
export async function dashboardMetrics() {
  const prisma = getPrisma();
  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const since7 = new Date(Date.now() - 7 * 86_400_000);

  const [
    totalStudents, new7, new30, pendingApplications, activeInternships, completedInternships,
    pendingTaskSubmissions, pendingProjectReviews, eligibleNoCert, paymentsUnderReview, issuedCertificates,
  ] = await Promise.all([
    prisma.studentProfile.count(),
    prisma.studentProfile.count({ where: { createdAt: { gte: since7 } } }),
    prisma.studentProfile.count({ where: { createdAt: { gte: since30 } } }),
    prisma.application.count({ where: { status: "PENDING" } }),
    prisma.application.count({ where: { status: "APPROVED", completionStatus: "IN_PROGRESS" } }),
    prisma.application.count({ where: { completionStatus: "COMPLETED" } }),
    prisma.taskSubmission.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }),
    prisma.projectSubmission.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }),
    prisma.application.count({ where: { certificateEligibleAt: { not: null }, paymentRequests: { none: { status: "APPROVED" } } } }),
    prisma.paymentRequest.count({ where: { status: "UNDER_REVIEW" } }),
    prisma.certificate.count({ where: { status: "GENERATED" } }),
  ]);

  // Parameterised raw SQL (tagged template): the date is bound, never concatenated.
  const registrations = await prisma.$queryRaw<Array<{ day: Date; count: bigint }>>(
    Prisma.sql`SELECT date_trunc('day', created_at) AS day, count(*)::bigint AS count FROM student_profiles WHERE created_at >= ${since30} GROUP BY 1 ORDER BY 1`,
  );
  const [byDomainRaw, completionRaw, paymentsRaw, domains] = await Promise.all([
    prisma.application.groupBy({ by: ["domainId"], _count: { _all: true }, orderBy: { _count: { domainId: "desc" } }, take: 8 }),
    prisma.application.groupBy({ by: ["completionStatus"], where: { status: "APPROVED" }, _count: { _all: true } }),
    prisma.paymentRequest.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.domain.findMany({ select: { id: true, name: true } }),
  ]);
  const names = new Map(domains.map((d) => [d.id, d.name]));

  const days: Array<{ label: string; value: number }> = [];
  const counts = new Map(registrations.map((r) => [r.day.toISOString().slice(0, 10), Number(r.count)]));
  for (let i = 29; i >= 0; i -= 1) {
    const key = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    days.push({ label: key.slice(5), value: counts.get(key) ?? 0 });
  }

  return {
    totals: { totalStudents, new7, new30, pendingApplications, activeInternships, completedInternships, pendingTaskSubmissions, pendingProjectReviews, eligibleNoCert, paymentsUnderReview, issuedCertificates },
    registrations: days,
    byDomain: byDomainRaw.map((r) => ({ label: names.get(r.domainId) ?? "Unknown", value: r._count._all })),
    completion: completionRaw.map((r) => ({ label: r.completionStatus, value: r._count._all })),
    payments: paymentsRaw.map((r) => ({ label: r.status, value: r._count._all })),
  };
}

export interface StudentFilter {
  q?: string;
  accountStatus?: string;
  domainId?: string;
  applicationStatus?: string;
  sort?: string;
  dir?: string;
}

const SORTABLE: Record<string, string> = { name: "fullName", joined: "createdAt", college: "college", year: "graduationYear", branch: "branch" };

export function studentWhere(f: StudentFilter): Prisma.StudentProfileWhereInput {
  const q = f.q?.trim().slice(0, 80);
  return {
    ...(q ? { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { college: { contains: q, mode: "insensitive" } }, { user: { email: { contains: q.toLowerCase() } } }, { mobile: { contains: q } }] } : {}),
    ...(f.accountStatus === "ACTIVE" || f.accountStatus === "SUSPENDED" ? { user: { status: f.accountStatus } } : {}),
    ...(f.domainId || f.applicationStatus
      ? { user: { applications: { some: { ...(f.domainId ? { domainId: f.domainId } : {}), ...(["PENDING", "APPROVED", "REJECTED", "WITHDRAWN"].includes(f.applicationStatus ?? "") ? { status: f.applicationStatus as "PENDING" } : {}) } } } }
      : {}),
  };
}

export function studentOrder(f: StudentFilter): Prisma.StudentProfileOrderByWithRelationInput {
  const field = SORTABLE[f.sort ?? "joined"] ?? "createdAt";
  return { [field]: f.dir === "asc" ? "asc" : "desc" };
}

const studentInclude = {
  user: { select: { id: true, email: true, status: true, applications: { orderBy: { createdAt: "desc" as const }, take: 1, select: { status: true, completionStatus: true, domain: { select: { name: true } } } } } },
};

export async function listStudents(filter: StudentFilter, skip: number, take: number) {
  const where = studentWhere(filter);
  const [rows, total] = await Promise.all([
    getPrisma().studentProfile.findMany({ where, orderBy: studentOrder(filter), skip, take, include: studentInclude }),
    getPrisma().studentProfile.count({ where }),
  ]);
  return { rows, total };
}

/** Cursor-paged iterator so a 50,000 row export never sits in memory at once. */
export async function* iterateStudents(filter: StudentFilter, batch = 500) {
  let cursor: string | undefined;
  for (;;) {
    const rows = await getPrisma().studentProfile.findMany({ where: studentWhere(filter), orderBy: { id: "asc" }, take: batch, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}), include: studentInclude });
    if (rows.length === 0) return;
    yield* rows;
    cursor = rows[rows.length - 1]?.id;
    if (rows.length < batch) return;
  }
}

/**
 * CSV cell escaping, including spreadsheet formula-injection defence: a value that
 * starts with = + - @ (or tab/CR) would be executed as a formula by Excel/Sheets, so it
 * is prefixed with an apostrophe.
 */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",") + "\r\n";
}
