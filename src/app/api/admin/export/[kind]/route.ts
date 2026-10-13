import { RateLimitError, ValidationError } from "@/lib/api/errors";
import { route } from "@/lib/api/handler";
import { requireStaff } from "@/lib/auth/guards";
import { PAGINATION } from "@/lib/config/constants";
import { getPrisma } from "@/lib/db/prisma";
import { consumeRateLimit } from "@/lib/redis/rate-limit";
import { audit } from "@/server/services/audit";
import { csvRow, iterateStudents } from "@/server/services/admin";

const KINDS = {
  students: "students.export",
  applications: "students.export",
  certificates: "certificates.issue",
  payments: "payments.view",
} as const;
type Kind = keyof typeof KINDS;

/**
 * Streams a CSV in batches (constant memory). Permission-checked, rate-limited, audited,
 * and every cell is formula-injection safe. A cap protects the database from runaway exports.
 */
export const GET = route<{ params: Promise<{ kind: string }> }>(async (req, ctx, meta) => {
  const { kind } = await ctx.params;
  if (!(kind in KINDS)) throw new ValidationError("Unknown export.");
  const staff = await requireStaff(KINDS[kind as Kind]);
  const limit = await consumeRateLimit({ name: "admin-export", limit: 10, windowSeconds: 3600, identifier: staff.userId });
  if (!limit.allowed) throw new RateLimitError("Too many exports. Try again later.", limit.retryAfterSeconds);

  const params = new URL(req.url).searchParams;
  const prisma = getPrisma();
  const encoder = new TextEncoder();
  let rows = 0;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const push = (line: string) => controller.enqueue(encoder.encode(line));
      try {
        if (kind === "students") {
          push(csvRow(["Name", "Email", "Mobile", "College", "Degree", "Branch", "Year", "Graduation", "Domain", "Application", "Internship", "Joined"]));
          const filter = { q: params.get("q") ?? undefined, accountStatus: params.get("status") ?? undefined, domainId: params.get("domain") ?? undefined, applicationStatus: params.get("app") ?? undefined };
          for await (const s of iterateStudents(filter)) {
            const a = s.user.applications[0];
            push(csvRow([s.fullName, s.user.email, s.mobile, s.college, s.degree, s.branch, s.yearOfStudy, s.graduationYear, a?.domain.name, a?.status, a?.completionStatus, s.createdAt]));
            if (++rows >= PAGINATION.maxExportRows) break;
          }
        } else if (kind === "applications") {
          push(csvRow(["Student", "Email", "Program", "Domain", "Status", "Completion", "Progress %", "Applied", "Completed"]));
          let cursor: string | undefined;
          for (;;) {
            const batch = await prisma.application.findMany({ take: 500, orderBy: { id: "asc" }, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}), include: { student: { select: { name: true, email: true } }, program: { select: { title: true } }, domain: { select: { name: true } } } });
            for (const a of batch) push(csvRow([a.student.name, a.student.email, a.program.title, a.domain.name, a.status, a.completionStatus, a.progressPercent, a.createdAt, a.completedAt]));
            rows += batch.length;
            if (batch.length < 500 || rows >= PAGINATION.maxExportRows) break;
            cursor = batch[batch.length - 1]?.id;
          }
        } else if (kind === "certificates") {
          push(csvRow(["Certificate ID", "Student", "Program", "Domain", "Status", "Issued"]));
          const certs = await prisma.certificate.findMany({ take: PAGINATION.maxExportRows, orderBy: { createdAt: "desc" } });
          for (const c of certs) push(csvRow([c.certificateId, c.snapshotStudentName, c.snapshotProgramTitle, c.snapshotDomainName, c.status, c.issueDate]));
          rows = certs.length;
        } else {
          push(csvRow(["Student", "Email", "Program", "Amount", "Currency", "UTR", "Status", "Submitted", "Reviewed"]));
          const pays = await prisma.paymentRequest.findMany({ take: PAGINATION.maxExportRows, orderBy: { createdAt: "desc" }, include: { student: { select: { name: true, email: true } }, program: { select: { title: true } } } });
          for (const p of pays) push(csvRow([p.student.name, p.student.email, p.program.title, Number(p.amount), p.currency, p.utr, p.status, p.submittedAt, p.reviewedAt]));
          rows = pays.length;
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        await audit({ userId: staff.userId, role: staff.primaryRole, ...meta }, "EXPORT_GENERATED", "Export", kind, { rows });
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
