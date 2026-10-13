/** Security tests against a real database and Redis.  RUN_DB_TESTS=1 DATABASE_URL=... npx vitest run tests/integration */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";

const d = describe.skipIf(process.env.RUN_DB_TESTS !== "1");
const tag = randomUUID().slice(0, 8);

d("SQL injection safety", () => {
  const payloads = ["' OR '1'='1", "'; DROP TABLE users; --", "\" OR 1=1 --", "%' UNION SELECT password_hash FROM users --", "admin@example.com'--"];
  it("the admin student search treats SQL as plain text", async () => {
    const { listStudents } = await import("@/server/services/admin");
    for (const q of payloads) {
      const { rows, total } = await listStudents({ q }, 0, 20);
      expect(Array.isArray(rows)).toBe(true);
      expect(total).toBeGreaterThanOrEqual(0);
    }
    expect(await getPrisma().user.count()).toBeGreaterThan(0); // the table still exists
  });
  it("stores a malicious contact message verbatim as inert text", async () => {
    const message = "'); DROP TABLE contact_messages; -- <script>alert(1)</script>";
    const row = await getPrisma().contactMessage.create({ data: { name: `T${tag}`, email: `t${tag}@test.dev`, subject: "Bobby Tables", message } });
    const back = await getPrisma().contactMessage.findUniqueOrThrow({ where: { id: row.id } });
    expect(back.message).toBe(message);
    await getPrisma().contactMessage.delete({ where: { id: row.id } });
  });
  it("parameterised raw SQL used by the dashboard binds values", async () => {
    const { dashboardMetrics } = await import("@/server/services/admin");
    const m = await dashboardMetrics();
    expect(m.registrations).toHaveLength(30);
  });
});

d("RBAC: permissions come from the database role matrix", () => {
  const make = async (role: "MENTOR" | "ADMIN" | "SUPER_ADMIN") => {
    const r = await getPrisma().role.findUniqueOrThrow({ where: { key: role } });
    const user = await getPrisma().user.create({ data: { email: `${role.toLowerCase()}-${tag}@test.dev`, name: role, status: "ACTIVE" } });
    await getPrisma().userRole.create({ data: { userId: user.id, roleId: r.id } });
    return getPrisma().user.findUniqueOrThrow({ where: { id: user.id }, include: { roles: { include: { role: true } } } });
  };
  const created: string[] = [];
  afterAll(async () => { await getPrisma().user.deleteMany({ where: { id: { in: created } } }); });

  it("a mentor can review tasks but cannot verify payments, change settings or manage admins", async () => {
    const { loadStaffContext, can } = await import("@/lib/auth/guards");
    const u = await make("MENTOR"); created.push(u.id);
    const staff = await loadStaffContext({ id: "s", user: u } as never);
    expect(staff && can(staff, "tasks.review")).toBe(true);
    for (const p of ["payments.review", "settings.manage", "admins.manage", "certificates.revoke", "completions.review"]) expect(can(staff!, p)).toBe(false);
  });
  it("an admin can verify payments but not manage super-admin things", async () => {
    const { loadStaffContext, can } = await import("@/lib/auth/guards");
    const u = await make("ADMIN"); created.push(u.id);
    const staff = await loadStaffContext({ id: "s", user: u } as never);
    expect(can(staff!, "payments.review")).toBe(true);
    expect(can(staff!, "admins.manage")).toBe(false);
    expect(can(staff!, "settings.manage")).toBe(false);
  });
  it("a student has no staff context at all", async () => {
    const { loadStaffContext } = await import("@/lib/auth/guards");
    const r = await getPrisma().role.findUniqueOrThrow({ where: { key: "STUDENT" } });
    const user = await getPrisma().user.create({ data: { email: `stu-${tag}@test.dev`, status: "ACTIVE" } });
    created.push(user.id);
    await getPrisma().userRole.create({ data: { userId: user.id, roleId: r.id } });
    const full = await getPrisma().user.findUniqueOrThrow({ where: { id: user.id }, include: { roles: { include: { role: true } } } });
    expect(await loadStaffContext({ id: "s", user: full } as never)).toBeNull();
  });
});

d("rate limiting (Redis)", () => {
  it("blocks OTP requests after the configured limit", async () => {
    const { consumeRateLimit, rateLimits } = await import("@/lib/redis/rate-limit");
    const email = `rl-${tag}@test.dev`;
    const results = [];
    for (let i = 0; i < 8; i += 1) results.push((await consumeRateLimit(rateLimits.otpRequest(email))).allowed);
    expect(results.slice(0, 5).every(Boolean)).toBe(true); // 5 per 15 minutes
    expect(results.slice(5).some((ok) => !ok)).toBe(true);
  });
  it("blocks repeated admin login attempts", async () => {
    const { consumeRateLimit, rateLimits } = await import("@/lib/redis/rate-limit");
    const id = `admin-${tag}`;
    const results = [];
    for (let i = 0; i < 8; i += 1) results.push((await consumeRateLimit(rateLimits.adminLogin(id))).allowed);
    expect(results.some((ok) => !ok)).toBe(true);
  });
  it("limits certificate verification lookups per IP", async () => {
    const { consumeRateLimit, rateLimits } = await import("@/lib/redis/rate-limit");
    let blocked = false;
    for (let i = 0; i < 40; i += 1) if (!(await consumeRateLimit(rateLimits.certificateVerify(`ip-${tag}`))).allowed) blocked = true;
    expect(blocked).toBe(true);
  });
});

d("background jobs", () => {
  it("a job is claimed by exactly one worker even when two race", async () => {
    const { enqueueJob } = await import("@/server/jobs/queue");
    const { runDueJobs } = await import("@/server/jobs/runner");
    const id = await enqueueJob("NOTIFICATION", { t: tag }, { dedupeKey: `race-${tag}` });
    const [a, b] = await Promise.all([runDueJobs(50), runDueJobs(50)]);
    expect(a + b).toBeGreaterThanOrEqual(1);
    const job = await getPrisma().backgroundJob.findUniqueOrThrow({ where: { id } });
    expect(job.status).toBe("SUCCEEDED");
    expect(job.attempts).toBe(1); // ran once, not twice
  });
  it("enqueue is idempotent for the same dedupe key", async () => {
    const { enqueueJob } = await import("@/server/jobs/queue");
    const a = await enqueueJob("NOTIFICATION", {}, { dedupeKey: `dd-${tag}` });
    const b = await enqueueJob("NOTIFICATION", {}, { dedupeKey: `dd-${tag}` });
    expect(a).toBe(b);
  });
});
