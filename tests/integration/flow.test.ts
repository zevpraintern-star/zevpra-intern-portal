/**
 * End-to-end business flow against a REAL PostgreSQL database.
 * Run with:  RUN_DB_TESTS=1 npx vitest run tests/integration
 * (needs DATABASE_URL pointing at a migrated + seeded database; creates and removes its own data)
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";

const enabled = process.env.RUN_DB_TESTS === "1";
const d = describe.skipIf(!enabled);

const SYS = { userId: null, role: "SYSTEM" } as const;
const tag = randomUUID().slice(0, 8);
const prisma = () => getPrisma();

async function mkStudent(label: string) {
  const role = await prisma().role.findUniqueOrThrow({ where: { key: "STUDENT" } });
  const user = await prisma().user.create({ data: { email: `${label}-${tag}@test.dev`, name: `Student ${label}`, status: "ACTIVE" } });
  await prisma().userRole.create({ data: { userId: user.id, roleId: role.id } });
  await prisma().studentProfile.create({
    data: { userId: user.id, fullName: `Student ${label}`, mobile: "9876543210", college: "Test College", degree: "B.Tech", branch: "CSE", yearOfStudy: 3, graduationYear: 2027, termsAcceptedAt: new Date(), privacyAcceptedAt: new Date(), termsVersion: "t", privacyVersion: "p" },
  });
  return user;
}

d("internship flow (real database)", () => {
  let domainId = ""; let programId = ""; let taskA = ""; let taskB = ""; let projectA = ""; let projectB = "";
  let alice: Awaited<ReturnType<typeof mkStudent>>; let bob: Awaited<ReturnType<typeof mkStudent>>;
  let aliceApp = ""; let paymentId = ""; let adminId = "";
  const created = { users: [] as string[] };

  beforeAll(async () => {
    const domain = await prisma().domain.findFirstOrThrow({ where: { isActive: true } });
    domainId = domain.id;
    const admin = await prisma().user.findUniqueOrThrow({ where: { email: "admin@example.com" } });
    adminId = admin.id;
    const program = await prisma().internshipProgram.create({
      data: { slug: `test-prog-${tag}`, title: `Test Internship ${tag}`, domainId, summary: "s", durationWeeks: 4, durationLabel: "4 Weeks", status: "PUBLISHED", minTasksForCompletion: 0 },
    });
    programId = program.id;
    const t1 = await prisma().task.create({ data: { programId, domainId, title: "Task A", slug: `ta-${tag}`, description: "do a", status: "PUBLISHED", submissionType: "GITHUB_LINK", maxAttempts: 2, points: 10, sortOrder: 1 } });
    const t2 = await prisma().task.create({ data: { programId, domainId, title: "Task B", slug: `tb-${tag}`, description: "do b", status: "PUBLISHED", submissionType: "TEXT", maxAttempts: 1, points: 10, sortOrder: 2 } });
    taskA = t1.id; taskB = t2.id;
    const p1 = await prisma().project.create({ data: { programId, title: "Project A", slug: `pa-${tag}`, description: "a", status: "PUBLISHED" } });
    const p2 = await prisma().project.create({ data: { programId, title: "Project B", slug: `pb-${tag}`, description: "b", status: "PUBLISHED" } });
    projectA = p1.id; projectB = p2.id;
    alice = await mkStudent("alice"); bob = await mkStudent("bob");
    created.users.push(alice.id, bob.id);
  });

  afterAll(async () => {
    const ids = created.users;
    await prisma().certificate.deleteMany({ where: { programId } });
    await prisma().paymentRequest.deleteMany({ where: { programId } });
    await prisma().internshipCompletion.deleteMany({ where: { programId } });
    await prisma().application.deleteMany({ where: { programId } });
    await prisma().internshipProgram.delete({ where: { id: programId } }).catch(() => undefined);
    await prisma().auditLog.deleteMany({ where: { actorUserId: { in: ids } } });
    await prisma().notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma().emailLog.deleteMany({ where: { userId: { in: ids } } });
    await prisma().securityEvent.deleteMany({ where: { userId: { in: ids } } });
    await prisma().fileAsset.deleteMany({ where: { ownerUserId: { in: ids } } });
    await prisma().user.deleteMany({ where: { id: { in: ids } } });
  });

  it("applies once, and a duplicate application is rejected by the database constraint", async () => {
    const { applyToProgram } = await import("@/server/services/applications");
    const app = await applyToProgram(alice.id, { programId }, { userId: alice.id, role: "STUDENT" });
    aliceApp = app.id;
    expect(app.status).toBe("PENDING");
    await expect(applyToProgram(alice.id, { programId }, { userId: alice.id })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("approving assigns tasks, and a second decision cannot double-process", async () => {
    const { decideApplication } = await import("@/server/services/applications");
    await decideApplication({ userId: adminId, role: "ADMIN" }, { applicationId: aliceApp, decision: "APPROVED" });
    expect(await prisma().taskAssignment.count({ where: { studentId: alice.id } })).toBe(2);
    await expect(decideApplication({ userId: adminId }, { applicationId: aliceApp, decision: "REJECTED", reason: "too late now" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("IDOR: another student cannot read or submit Alice's task", async () => {
    const { getStudentTask, submitTask } = await import("@/server/services/tasks");
    await expect(getStudentTask(bob.id, taskA)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(submitTask(bob.id, { taskId: taskA, githubUrl: "https://github.com/bob/x", fileIds: [] }, {})).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("projects stay locked until required tasks are approved (server-side gate)", async () => {
    const { selectProject } = await import("@/server/services/projects");
    await expect(selectProject(alice.id, { applicationId: aliceApp, projectId: projectA }, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("validates submissions, enforces attempts, and reviews update progress", async () => {
    const { submitTask, reviewTaskSubmission } = await import("@/server/services/tasks");
    const { computeProgress } = await import("@/server/services/progress");
    await expect(submitTask(alice.id, { taskId: taskA, fileIds: [] }, {})).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    const s1 = await submitTask(alice.id, { taskId: taskA, githubUrl: "https://github.com/alice/task-a", fileIds: [] }, {});
    await expect(submitTask(alice.id, { taskId: taskA, githubUrl: "https://github.com/alice/task-a", fileIds: [] }, {})).rejects.toMatchObject({ code: "CONFLICT" });
    await reviewTaskSubmission({ userId: adminId }, { submissionId: s1.id, decision: "CHANGES_REQUESTED", feedback: "Please add a README" });
    await expect(reviewTaskSubmission({ userId: adminId }, { submissionId: s1.id, decision: "APPROVED", feedback: "double review" })).rejects.toMatchObject({ code: "CONFLICT" });

    const s2 = await submitTask(alice.id, { taskId: taskA, githubUrl: "https://github.com/alice/task-a", fileIds: [] }, {});
    expect(s2.attemptNumber).toBe(2);
    await reviewTaskSubmission({ userId: adminId }, { submissionId: s2.id, decision: "APPROVED", feedback: "Great work" });
    const b = await submitTask(alice.id, { taskId: taskB, textAnswer: "my answer", fileIds: [] }, {});
    await reviewTaskSubmission({ userId: adminId }, { submissionId: b.id, decision: "APPROVED", feedback: "Correct answer" });

    const progress = await computeProgress(aliceApp);
    expect(progress.approvedTasks).toBe(2);
    expect(progress.tasksComplete).toBe(true);
  });

  it("project: select, lock after submission, reject duplicate repo, verify -> eligible", async () => {
    const { selectProject, submitProject, reviewProjectSubmission } = await import("@/server/services/projects");
    const { getPaymentView } = await import("@/server/services/payments");
    await expect(submitProject(alice.id, aliceApp, { projectId: projectA, githubUrl: "https://github.com/alice/final", fileIds: [] }, {})).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await selectProject(alice.id, { applicationId: aliceApp, projectId: projectA }, {});
    const sub = await submitProject(alice.id, aliceApp, { projectId: projectA, githubUrl: "https://github.com/alice/final", fileIds: [] }, {});
    await expect(selectProject(alice.id, { applicationId: aliceApp, projectId: projectB }, {})).rejects.toMatchObject({ code: "CONFLICT" });

    expect((await getPaymentView(alice.id, aliceApp)).eligible).toBe(false); // not eligible before verification
    await reviewProjectSubmission({ userId: adminId, role: "ADMIN" }, { submissionId: sub.id, decision: "APPROVED", feedback: "Verified, nicely done" });
    const view = await getPaymentView(alice.id, aliceApp);
    expect(view.eligible).toBe(true);
    paymentId = view.payment!.id;
    expect(view.payment!.status).toBe("NOT_SUBMITTED");
  });

  it("payment: screenshot + UTR never issue a certificate; only admin approval does", async () => {
    const { submitPaymentProof, reviewPayment } = await import("@/server/services/payments");
    const { runDueJobs } = await import("@/server/jobs/runner");
    const file = await prisma().fileAsset.create({ data: { ownerUserId: alice.id, purpose: "PAYMENT_SCREENSHOT", storageDriver: "local", storageKey: `t/${tag}/a.png`, originalName: "a.png", mimeType: "image/png", extension: ".png", sizeBytes: 100 } });
    const proof = { applicationId: aliceApp, utr: `UTR${tag.toUpperCase()}12345`, screenshotFileId: file.id, amountConfirmed: true as const };

    // someone else's file cannot be attached
    const bobFile = await prisma().fileAsset.create({ data: { ownerUserId: bob.id, purpose: "PAYMENT_SCREENSHOT", storageDriver: "local", storageKey: `t/${tag}/b.png`, originalName: "b.png", mimeType: "image/png", extension: ".png", sizeBytes: 100 } });
    await expect(submitPaymentProof(alice.id, { ...proof, screenshotFileId: bobFile.id }, {})).rejects.toMatchObject({ code: "FORBIDDEN" });

    await submitPaymentProof(alice.id, proof, {});
    expect(await prisma().certificate.count({ where: { studentId: alice.id } })).toBe(0);
    await expect(submitPaymentProof(alice.id, proof, {})).rejects.toMatchObject({ code: "CONFLICT" }); // already under review
    expect((await prisma().paymentRequest.findUniqueOrThrow({ where: { id: paymentId } })).status).toBe("UNDER_REVIEW");

    await expect(reviewPayment({ userId: adminId }, { paymentRequestId: paymentId, decision: "REJECTED" })).rejects.toThrow(); // reason required

    const [r1, r2] = await Promise.allSettled([
      reviewPayment({ userId: adminId, role: "ADMIN" }, { paymentRequestId: paymentId, decision: "APPROVED" }),
      reviewPayment({ userId: adminId, role: "ADMIN" }, { paymentRequestId: paymentId, decision: "APPROVED" }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual(["fulfilled", "rejected"]); // exactly one wins
    expect(await prisma().certificate.count({ where: { studentId: alice.id } })).toBe(1);

    // The after()/setImmediate kick and this manual run may both try to claim the job;
    // the guarded claim guarantees exactly one wins, so wait for the outcome.
    let cert = await prisma().certificate.findFirstOrThrow({ where: { studentId: alice.id } });
    for (let i = 0; i < 40 && cert.status !== "GENERATED"; i += 1) {
      await runDueJobs(20);
      await new Promise((resolve) => setTimeout(resolve, 150));
      cert = await prisma().certificate.findFirstOrThrow({ where: { studentId: alice.id } });
    }
    expect(cert.status).toBe("GENERATED");
    expect(cert.pdfFileId).toBeTruthy();
  });

  it("certificate verification exposes only public fields, and revocation is honoured", async () => {
    const { verifyCertificate, revokeCertificate } = await import("@/server/services/certificates");
    const cert = await prisma().certificate.findFirstOrThrow({ where: { studentId: alice.id } });
    const ok = await verifyCertificate(cert.verificationId);
    expect(ok.status).toBe("VALID");
    expect(JSON.stringify(ok)).not.toMatch(/@test\.dev|9876543210|Test College/);
    expect((await verifyCertificate("NOPE-NOT-REAL-ID")).status).toBe("NOT_FOUND");
    await revokeCertificate(SYS, cert.id, "test revocation");
    expect((await verifyCertificate(cert.certificateId)).status).toBe("REVOKED");
  });

  it("Bob cannot use Alice's certificate or payment (ownership)", async () => {
    const { getOwnCertificate } = await import("@/server/services/certificates");
    const { getPaymentView } = await import("@/server/services/payments");
    const cert = await prisma().certificate.findFirstOrThrow({ where: { studentId: alice.id } });
    await expect(getOwnCertificate(bob.id, cert.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getPaymentView(bob.id, aliceApp)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
