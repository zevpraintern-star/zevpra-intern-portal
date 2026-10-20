"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

import { bool, num, runAction, str, strList, type ActionState } from "@/lib/api/action";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/errors";
import { requestMeta } from "@/lib/api/request";
import { actorOf, can, requireStaff } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { hashPassword, verifyPassword } from "@/lib/security/crypto";
import { slugify } from "@/lib/utils/text";
import { paymentSettingsSchema } from "@/lib/validation/payment";
import { audit } from "@/server/services/audit";
import { assignTaskToEnrolled, decideApplication } from "@/server/services/applications";
import { revokeCertificate } from "@/server/services/certificates";
import { reviewPayment } from "@/server/services/payments";
import { reviewProjectSubmission } from "@/server/services/projects";
import { clearSettingsCache, isHardTierEnabled, setSetting } from "@/server/services/settings";
import { reviewTaskSubmission } from "@/server/services/tasks";

async function ctx(permission: string) {
  const staff = await requireStaff(permission);
  const meta = requestMeta(await headers());
  return { staff, actor: actorOf(staff, meta) };
}

const lines = (form: FormData, key: string): string[] =>
  (str(form, key) ?? "").split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean).slice(0, 40);
const date = (form: FormData, key: string): Date | null => {
  const v = str(form, key);
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new ValidationError("Enter a valid date.", [{ field: key, message: "Enter a valid date." }]);
  return d;
};

async function uniqueSlug(base: string, exists: (slug: string) => Promise<boolean>): Promise<string> {
  const root = slugify(base) || "item";
  let slug = root;
  for (let i = 2; await exists(slug); i += 1) slug = `${root}-${i}`;
  return slug;
}

// ---- Applications & students ------------------------------------------------

export async function reviewApplicationAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await ctx("applications.review");
    await decideApplication(actor, { applicationId: str(form, "applicationId") as string, decision: str(form, "decision") as "APPROVED", reason: str(form, "reason") });
    revalidatePath("/admin", "layout");
    redirect("/admin/applications?flash=application_reviewed");
  });
}

export async function setStudentStatusAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await ctx("students.manage");
    const userId = z.string().uuid().parse(str(form, "userId"));
    const status = z.enum(["ACTIVE", "SUSPENDED"]).parse(str(form, "status"));
    const target = await getPrisma().user.findFirst({ where: { id: userId, roles: { some: { role: { key: "STUDENT" } } } }, select: { id: true } });
    if (!target) throw new NotFoundError("Student not found.");
    await getPrisma().user.update({ where: { id: userId }, data: { status } });
    if (status === "SUSPENDED") await getPrisma().session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: "account_suspended" } });
    await audit(actor, status === "SUSPENDED" ? "STUDENT_SUSPENDED" : "STUDENT_REACTIVATED", "User", userId, { reason: str(form, "reason") });
    revalidatePath("/admin", "layout");
    return status === "SUSPENDED" ? "Student suspended and signed out." : "Student reactivated.";
  });
}

// ---- Programs, tasks, projects ----------------------------------------------

export async function saveProgramAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { staff, actor } = await ctx("programs.manage");
    const id = str(form, "id");
    const data = z.object({
      title: z.string().trim().min(4).max(200), domainId: z.string().uuid(), summary: z.string().trim().min(10).max(500),
      durationWeeks: z.coerce.number().int().min(1).max(52), difficulty: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
      status: z.enum(["DRAFT", "PUBLISHED", "CLOSED", "ARCHIVED"]), minTasksForCompletion: z.coerce.number().int().min(0).max(200),
    }).parse({ title: str(form, "title"), domainId: str(form, "domainId"), summary: str(form, "summary"), durationWeeks: str(form, "durationWeeks"), difficulty: str(form, "difficulty"), status: str(form, "status"), minTasksForCompletion: str(form, "minTasksForCompletion") ?? "0" });
    const common = {
      ...data, description: str(form, "description"), durationLabel: `${data.durationWeeks} Weeks`, skills: lines(form, "skills"), prerequisites: lines(form, "prerequisites"),
      learningOutcomes: lines(form, "learningOutcomes"), certificateRequirements: str(form, "certificateRequirements"),
      startDate: date(form, "startDate"), endDate: date(form, "endDate"), isFeatured: bool(form, "isFeatured"),
    };
    if (id) {
      const existing = await getPrisma().internshipProgram.findUnique({ where: { id }, select: { status: true } });
      if (!existing) throw new NotFoundError("Program not found.");
      await getPrisma().internshipProgram.update({ where: { id }, data: { ...common, ...(data.status === "PUBLISHED" && existing.status !== "PUBLISHED" ? { publishedAt: new Date() } : {}) } });
      await audit(actor, "PROGRAM_UPDATED", "InternshipProgram", id, { status: data.status });
    } else {
      const slug = await uniqueSlug(data.title, async (s) => Boolean(await getPrisma().internshipProgram.findUnique({ where: { slug: s }, select: { id: true } })));
      const created = await getPrisma().internshipProgram.create({ data: { ...common, slug, createdById: staff.userId, publishedAt: data.status === "PUBLISHED" ? new Date() : null } });
      await audit(actor, "PROGRAM_CREATED", "InternshipProgram", created.id);
    }
    revalidatePath("/admin", "layout"); revalidatePath("/internships"); revalidatePath("/");
    return "Program saved.";
  });
}

export async function saveTaskAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { staff, actor } = await ctx("tasks.manage");
    const id = str(form, "id");
    const data = z.object({
      programId: z.string().uuid(), title: z.string().trim().min(3).max(200), description: z.string().trim().min(10).max(8000),
      difficulty: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]), submissionType: z.enum(["FILE", "GITHUB_LINK", "LIVE_URL", "TEXT", "MIXED"]),
      maxAttempts: z.coerce.number().int().min(1).max(10), points: z.coerce.number().int().min(0).max(1000), sortOrder: z.coerce.number().int().min(0).max(10000),
      status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
    }).parse({ programId: str(form, "programId"), title: str(form, "title"), description: str(form, "description"), difficulty: str(form, "difficulty"), submissionType: str(form, "submissionType"), maxAttempts: str(form, "maxAttempts") ?? "3", points: str(form, "points") ?? "10", sortOrder: str(form, "sortOrder") ?? "0", status: str(form, "status") });
    const common = { ...data, domainId: str(form, "domainId") ?? null, instructions: str(form, "instructions"), requiresGithubLink: bool(form, "requiresGithubLink"), deadline: date(form, "deadline") };
    const program = await getPrisma().internshipProgram.findUnique({ where: { id: data.programId }, select: { id: true, status: true } });
    if (!program) throw new NotFoundError("The selected internship does not exist.");
    let taskId = id;
    if (id) {
      const before = await getPrisma().task.findUnique({ where: { id }, select: { status: true } });
      if (!before) throw new NotFoundError("Task not found.");
      await getPrisma().task.update({ where: { id }, data: { ...common, ...(data.status === "PUBLISHED" && before.status !== "PUBLISHED" ? { publishedAt: new Date() } : {}) } });
      await audit(actor, "TASK_UPDATED", "Task", id, { status: data.status });
    } else {
      const slug = await uniqueSlug(`${data.title}`, async (s) => Boolean(await getPrisma().task.findFirst({ where: { programId: data.programId, slug: s }, select: { id: true } })));
      const created = await getPrisma().task.create({ data: { ...common, slug, createdById: staff.userId, publishedAt: data.status === "PUBLISHED" ? new Date() : null } });
      taskId = created.id;
      await audit(actor, "TASK_CREATED", "Task", created.id);
    }
    const assigned = data.status === "PUBLISHED" && taskId ? await assignTaskToEnrolled(taskId) : 0;
    revalidatePath("/admin", "layout");
    return assigned > 0 ? `Task saved and assigned to ${assigned} enrolled student${assigned === 1 ? "" : "s"}.` : "Task saved.";
  });
}

export async function saveProjectAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { staff, actor } = await ctx("projects.manage");
    const id = str(form, "id");
    const data = z.object({
      programId: z.string().uuid(), title: z.string().trim().min(3).max(200), description: z.string().trim().min(10).max(8000),
      maxScore: z.coerce.number().int().min(1).max(1000), sortOrder: z.coerce.number().int().min(0).max(10000), status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
      difficulty: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
    }).parse({ programId: str(form, "programId"), title: str(form, "title"), description: str(form, "description"), maxScore: str(form, "maxScore") ?? "100", sortOrder: str(form, "sortOrder") ?? "0", status: str(form, "status"), difficulty: str(form, "difficulty") ?? "BEGINNER" });
    if (data.difficulty === "ADVANCED" && !(await isHardTierEnabled())) {
      throw new ValidationError("The Hard tier is disabled.", [{ field: "difficulty", message: "Enable hard_tier_enabled in settings to use the Hard tier." }]);
    }
    const common = { ...data, requirements: lines(form, "requirements"), skills: lines(form, "skills"), requiresLiveUrl: bool(form, "requiresLiveUrl"), deadline: date(form, "deadline"), requiresGithubLink: true, isFinalProject: true, submissionMethod: "GITHUB_LINK" as const };
    if (id) {
      const before = await getPrisma().project.findUnique({ where: { id }, select: { status: true } });
      if (!before) throw new NotFoundError("Project not found.");
      await getPrisma().project.update({ where: { id }, data: { ...common, ...(data.status === "PUBLISHED" && before.status !== "PUBLISHED" ? { publishedAt: new Date() } : {}) } });
      await audit(actor, "PROJECT_UPDATED", "Project", id);
    } else {
      const slug = await uniqueSlug(data.title, async (s) => Boolean(await getPrisma().project.findFirst({ where: { programId: data.programId, slug: s }, select: { id: true } })));
      const created = await getPrisma().project.create({ data: { ...common, slug, createdById: staff.userId, publishedAt: data.status === "PUBLISHED" ? new Date() : null } });
      await audit(actor, "PROJECT_CREATED", "Project", created.id);
    }
    revalidatePath("/admin", "layout");
    return "Project saved.";
  });
}

// ---- Reviews -----------------------------------------------------------------

export async function reviewTaskAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await ctx("tasks.review");
    await reviewTaskSubmission(actor, { submissionId: str(form, "submissionId") as string, decision: str(form, "decision") as "APPROVED", feedback: str(form, "feedback") as string, pointsAwarded: num(form, "pointsAwarded") } as never);
    revalidatePath("/admin", "layout");
    redirect("/admin/submissions?flash=task_reviewed");
  });
}

export async function reviewProjectAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { staff, actor } = await ctx("projects.review");
    const decision = str(form, "decision");
    // Approving a project completes the internship and unlocks the certificate: that
    // is a stronger power than leaving feedback, so it needs completions.review too.
    if (decision === "APPROVED" && !can(staff, "completions.review")) throw new ForbiddenError("Only an administrator can approve a final project.");
    await reviewProjectSubmission(actor, { submissionId: str(form, "submissionId") as string, decision: decision as "APPROVED", feedback: str(form, "feedback") as string, score: num(form, "score") } as never);
    revalidatePath("/admin", "layout");
    redirect(`/admin/submissions?flash=${decision === "APPROVED" ? "project_approved" : "project_reviewed"}`);
  });
}

export async function reviewPaymentAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await ctx("payments.review");
    const result = await reviewPayment(actor, { paymentRequestId: str(form, "paymentRequestId") as string, decision: str(form, "decision") as "APPROVED", reason: str(form, "reason") } as never);
    revalidatePath("/admin", "layout");
    redirect(`/admin/payments?flash=${result.certificateId ? "payment_approved" : "payment_rejected"}`);
  });
}

export async function revokeCertificateAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await ctx("certificates.revoke");
    const reason = z.string().trim().min(5, "Give a reason (min 5 characters).").max(500).parse(str(form, "reason") ?? "");
    await revokeCertificate(actor, z.string().uuid().parse(str(form, "certificateId")), reason);
    revalidatePath("/admin", "layout");
    redirect("/admin/certificates?flash=certificate_revoked");
  });
}

// ---- Domains & content --------------------------------------------------------

export async function saveDomainAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { staff, actor } = await ctx("domains.manage");
    const id = str(form, "id");
    const data = z.object({ categoryId: z.string().uuid(), name: z.string().trim().min(2).max(120), sortOrder: z.coerce.number().int().min(0).max(10000) }).parse({ categoryId: str(form, "categoryId"), name: str(form, "name"), sortOrder: str(form, "sortOrder") ?? "0" });
    const common = { ...data, shortDescription: str(form, "shortDescription"), description: str(form, "description"), iconName: str(form, "iconName"), isFeatured: bool(form, "isFeatured"), isActive: form.has("isActive") ? bool(form, "isActive") : true };
    if (id) {
      await getPrisma().domain.update({ where: { id }, data: common });
      await audit(actor, "DOMAIN_UPDATED", "Domain", id);
    } else {
      const slug = await uniqueSlug(data.name, async (s) => Boolean(await getPrisma().domain.findUnique({ where: { slug: s }, select: { id: true } })));
      const created = await getPrisma().domain.create({ data: { ...common, slug, createdById: staff.userId } });
      await audit(actor, "DOMAIN_CREATED", "Domain", created.id);
    }
    revalidatePath("/admin", "layout"); revalidatePath("/domains"); revalidatePath("/");
    return "Domain saved.";
  });
}

export async function deleteDomainAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await ctx("domains.manage");
    const id = z.string().uuid().parse(str(form, "id"));
    const used = await getPrisma().internshipProgram.count({ where: { domainId: id } }) + (await getPrisma().application.count({ where: { domainId: id } }));
    if (used > 0) {
      await getPrisma().domain.update({ where: { id }, data: { isActive: false } });
      await audit(actor, "DOMAIN_UPDATED", "Domain", id, { deactivated: true });
      revalidatePath("/admin", "layout"); revalidatePath("/domains");
      return "This domain is in use, so it was hidden instead of deleted.";
    }
    await getPrisma().domain.delete({ where: { id } });
    await audit(actor, "DOMAIN_DELETED", "Domain", id);
    revalidatePath("/admin", "layout"); revalidatePath("/domains"); revalidatePath("/");
    return "Domain deleted.";
  });
}

export async function saveCategoryAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await ctx("domains.manage");
    const name = z.string().trim().min(2).max(100).parse(str(form, "name"));
    const slug = await uniqueSlug(name, async (s) => Boolean(await getPrisma().domainCategory.findUnique({ where: { slug: s }, select: { id: true } })));
    const row = await getPrisma().domainCategory.create({ data: { name, slug, description: str(form, "description"), sortOrder: num(form, "sortOrder") ?? 0 } });
    await audit(actor, "DOMAIN_CREATED", "DomainCategory", row.id);
    revalidatePath("/admin", "layout"); revalidatePath("/domains"); revalidatePath("/");
    return "Category created.";
  });
}

export async function saveFaqAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await ctx("content.manage");
    const id = str(form, "id");
    const data = z.object({ question: z.string().trim().min(5).max(300), answer: z.string().trim().min(5).max(4000) }).parse({ question: str(form, "question"), answer: str(form, "answer") });
    const common = { ...data, category: str(form, "category") ?? "general", sortOrder: num(form, "sortOrder") ?? 0, isPublished: form.has("isPublished") ? bool(form, "isPublished") : true };
    const row = id ? await getPrisma().faq.update({ where: { id }, data: common }) : await getPrisma().faq.create({ data: common });
    await audit(actor, "SETTING_UPDATED", "Faq", row.id);
    revalidatePath("/admin", "layout"); revalidatePath("/faq");
    return "FAQ saved.";
  });
}

export async function deleteFaqAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await ctx("content.manage");
    const id = z.string().uuid().parse(str(form, "id"));
    await getPrisma().faq.delete({ where: { id } });
    await audit(actor, "SETTING_UPDATED", "Faq", id, { deleted: true });
    revalidatePath("/admin", "layout"); revalidatePath("/faq");
    return "FAQ deleted.";
  });
}

export async function saveAnnouncementAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { staff, actor } = await ctx("announcements.manage");
    const data = z.object({ title: z.string().trim().min(3).max(200), body: z.string().trim().min(5).max(5000) }).parse({ title: str(form, "title"), body: str(form, "body") });
    const published = bool(form, "isPublished");
    const programId = str(form, "programId");
    const row = await getPrisma().announcement.create({ data: { ...data, audience: programId ? "INTERNSHIP" : "ALL", programId: programId ?? null, isPublished: published, publishedAt: published ? new Date() : null, createdById: staff.userId } });
    await audit(actor, "SETTING_UPDATED", "Announcement", row.id);
    revalidatePath("/admin", "layout");
    return published ? "Announcement published." : "Saved as draft.";
  });
}

export async function deleteAnnouncementAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await ctx("announcements.manage");
    const id = z.string().uuid().parse(str(form, "id"));
    await getPrisma().announcement.delete({ where: { id } });
    await audit(actor, "SETTING_UPDATED", "Announcement", id, { deleted: true });
    revalidatePath("/admin", "layout");
    return "Announcement deleted.";
  });
}

export async function saveHomepageSectionAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { staff, actor } = await ctx("content.manage");
    const id = z.string().uuid().parse(str(form, "id"));
    await getPrisma().homepageSection.update({ where: { id }, data: { title: str(form, "title") ?? null, subtitle: str(form, "subtitle") ?? null, isEnabled: bool(form, "isEnabled"), updatedById: staff.userId } });
    await audit(actor, "SETTING_UPDATED", "HomepageSection", id);
    revalidatePath("/admin", "layout"); revalidatePath("/");
    return "Section saved.";
  });
}

export async function updateContactAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { staff, actor } = await ctx("messages.manage");
    const id = z.string().uuid().parse(str(form, "id"));
    const status = z.enum(["NEW", "IN_REVIEW", "RESOLVED", "SPAM"]).parse(str(form, "status"));
    await getPrisma().contactMessage.update({ where: { id }, data: { status, handledById: staff.userId, handledAt: new Date() } });
    await audit(actor, "CONTACT_HANDLED", "ContactMessage", id, { status });
    revalidatePath("/admin", "layout");
    return "Updated.";
  });
}

// ---- Settings ------------------------------------------------------------------


export async function savePaymentSettingsAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { staff, actor } = await ctx("settings.manage");
    const data = paymentSettingsSchema.parse({
      certificateFee: str(form, "certificateFee"), currency: str(form, "currency") ?? "INR", upiId: str(form, "upiId") ?? "",
      upiPayeeName: str(form, "upiPayeeName"), upiQrFileId: strList(form, "upiQrFileId")[0], instructions: str(form, "instructions"),
    });
    const set = (key: string, value: string | number | boolean, type: "STRING" | "NUMBER" | "BOOLEAN") => setSetting(key, value, type, staff.userId, { category: "payment" });

    await set("certificate_fee", data.certificateFee, "NUMBER");
    await set("currency", data.currency, "STRING");
    await set("upi_id", data.upiId, "STRING");
    await set("upi_payee_name", data.upiPayeeName ?? "", "STRING");
    await set("payment_instructions", data.instructions ?? "", "STRING");

    if (data.upiQrFileId) {
      const file = await getPrisma().fileAsset.findFirst({ where: { id: data.upiQrFileId, purpose: "PAYMENT_QR", deletedAt: null }, select: { id: true } });
      if (!file) throw new ValidationError("That QR image is not available.", [{ field: "upiQrFileId", message: "Upload the QR image again." }]);
      await set("upi_qr_file_id", data.upiQrFileId, "STRING");
    }

    await set("application_auto_approve", bool(form, "autoApprove"), "BOOLEAN");

    // Save the Hard tier setting when the form supplies a value.
    const hardTierValue = form.get("hardTier");
    let hardTierForAudit: boolean | undefined;

    if (hardTierValue === "on" || hardTierValue === "true" || hardTierValue === "1") {
      await set("hard_tier_enabled", "true", "STRING");
      hardTierForAudit = true;
    } else if (hardTierValue === "false" || hardTierValue === "0") {
      await set("hard_tier_enabled", "false", "STRING");
      hardTierForAudit = false;
    }

    const disclaimer = str(form, "certificateDisclaimer");
    if (disclaimer) await set("certificate_disclaimer", disclaimer, "STRING");

    clearSettingsCache();

    await audit(actor, "SETTING_UPDATED", "AppSetting", "payment", {
      fee: data.certificateFee,
      currency: data.currency,
      upiId: data.upiId,
      qrChanged: Boolean(data.upiQrFileId),
      autoApprove: bool(form, "autoApprove"),
      ...(hardTierForAudit !== undefined ? { hardTier: hardTierForAudit } : {}),
    });

    revalidatePath("/admin", "layout");
    revalidatePath("/student", "layout");

    return "Settings saved.";
  });
}


// ---- Staff accounts -------------------------------------------------------------

const strongPassword = z.string().min(12, "Use at least 12 characters.").max(128).regex(/[a-z]/, "Add a lowercase letter.").regex(/[A-Z]/, "Add an uppercase letter.").regex(/\d/, "Add a number.");

export async function createStaffAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { actor } = await ctx("admins.manage");
    const data = z.object({ email: z.string().trim().toLowerCase().email().max(255), name: z.string().trim().min(2).max(120), role: z.enum(["MENTOR", "ADMIN", "SUPER_ADMIN"]), password: strongPassword })
      .parse({ email: str(form, "email"), name: str(form, "name"), role: str(form, "role"), password: str(form, "password") });
    if (await getPrisma().user.findUnique({ where: { email: data.email }, select: { id: true } })) throw new ConflictError("An account with this email already exists.");
    const role = await getPrisma().role.findUniqueOrThrow({ where: { key: data.role } });
    const user = await getPrisma().user.create({ data: { email: data.email, name: data.name, status: "ACTIVE", passwordHash: await hashPassword(data.password), emailVerifiedAt: new Date() } });
    await getPrisma().userRole.create({ data: { userId: user.id, roleId: role.id } });
    await audit(actor, "ADMIN_CREATED", "User", user.id, { role: data.role, email: data.email });
    revalidatePath("/admin", "layout");
    return `${data.role.replace("_", " ").toLowerCase()} account created. Share the password with them through a secure channel; sign-in also needs an emailed code.`;
  });
}

export async function changeStaffRoleAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { staff, actor } = await ctx("admins.manage");
    const userId = z.string().uuid().parse(str(form, "userId"));
    const roleKey = z.enum(["MENTOR", "ADMIN", "SUPER_ADMIN"]).parse(str(form, "role"));
    if (userId === staff.userId) throw new ForbiddenError("You cannot change your own role.");
    const prisma = getPrisma();
    const current = await prisma.userRole.findMany({ where: { userId, role: { key: { in: ["MENTOR", "ADMIN", "SUPER_ADMIN"] } } }, include: { role: true } });
    if (current.length === 0) throw new NotFoundError("Staff account not found.");
    if (current.some((r) => r.role.key === "SUPER_ADMIN") && roleKey !== "SUPER_ADMIN") {
      const supers = await prisma.userRole.count({ where: { role: { key: "SUPER_ADMIN" }, user: { status: "ACTIVE" } } });
      if (supers <= 1) throw new ConflictError("There must always be at least one active super administrator.");
    }
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    await prisma.$transaction([
      prisma.userRole.deleteMany({ where: { userId, roleId: { in: current.map((c) => c.roleId) } } }),
      prisma.userRole.create({ data: { userId, roleId: role.id } }),
      prisma.session.updateMany({ where: { userId, kind: "ADMIN", revokedAt: null }, data: { revokedAt: new Date(), revokedReason: "role_changed" } }),
    ]);
    await audit(actor, "ADMIN_ROLE_CHANGED", "User", userId, { from: current.map((c) => c.role.key), to: roleKey });
    revalidatePath("/admin", "layout");
    revalidateTag("role-permissions");
    return "Role changed. Their sessions were signed out so the new permissions apply immediately.";
  });
}

export async function setStaffStatusAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { staff, actor } = await ctx("admins.manage");
    const userId = z.string().uuid().parse(str(form, "userId"));
    const status = z.enum(["ACTIVE", "SUSPENDED"]).parse(str(form, "status"));
    if (userId === staff.userId) throw new ForbiddenError("You cannot suspend yourself.");
    const target = await getPrisma().user.findFirst({ where: { id: userId, roles: { some: { role: { key: { in: ["MENTOR", "ADMIN", "SUPER_ADMIN"] } } } } }, include: { roles: { include: { role: true } } } });
    if (!target) throw new NotFoundError("Staff account not found.");
    if (status === "SUSPENDED" && target.roles.some((r) => r.role.key === "SUPER_ADMIN") && (await getPrisma().userRole.count({ where: { role: { key: "SUPER_ADMIN" }, user: { status: "ACTIVE" } } })) <= 1) throw new ConflictError("There must always be at least one active super administrator.");
    await getPrisma().user.update({ where: { id: userId }, data: { status } });
    if (status === "SUSPENDED") await getPrisma().session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: "account_suspended" } });
    await audit(actor, "ADMIN_ROLE_CHANGED", "User", userId, { status });
    revalidatePath("/admin", "layout");
    return status === "SUSPENDED" ? "Account suspended." : "Account reactivated.";
  });
}

export async function changeOwnPasswordAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const staff = await requireStaff();
    const next = strongPassword.parse(str(form, "newPassword") ?? "");
    const user = await getPrisma().user.findUniqueOrThrow({ where: { id: staff.userId }, select: { passwordHash: true } });
    if (!user.passwordHash || !(await verifyPassword(str(form, "currentPassword") ?? "", user.passwordHash))) throw new ValidationError("Your current password is incorrect.", [{ field: "currentPassword", message: "Incorrect password." }]);
    await getPrisma().user.update({ where: { id: staff.userId }, data: { passwordHash: await hashPassword(next) } });
    await getPrisma().session.updateMany({ where: { userId: staff.userId, kind: "ADMIN", revokedAt: null, id: { not: staff.sessionId } }, data: { revokedAt: new Date(), revokedReason: "password_changed" } });
    return "Password changed. Other sessions were signed out.";
  });
}
