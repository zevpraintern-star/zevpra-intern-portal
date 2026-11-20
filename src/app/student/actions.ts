"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { bool, num, runAction, str, strList, type ActionState } from "@/lib/api/action";
import { requestMeta } from "@/lib/api/request";
import { requireStudent } from "@/lib/auth/guards";
import { clearSessionCookie } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { githubProfileUrlSchema } from "@/lib/validation/common";
import { studentRegistrationSchema } from "@/lib/validation/student";
import { applyToProgram, withdrawApplication } from "@/server/services/applications";
import { selectProject, submitProject } from "@/server/services/projects";
import { submitTask } from "@/server/services/tasks";
import { markAllRead, markRead } from "@/server/services/notifications";
import { audit } from "@/server/services/audit";

async function context(operation: string) {
  const student = await requireStudent();
  const meta = requestMeta(await headers());
  const actor = { userId: student.userId, role: "STUDENT", ...meta };
  await audit(actor, "USER_ACTIVITY", "StudentAction", null, { operation, outcome: "attempted" });
  return { student, actor };
}

export async function applyAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { student, actor } = await context("application.apply");
    await applyToProgram(student.userId, { programId: str(form, "programId") as string, motivation: str(form, "motivation") }, actor);
    revalidatePath("/student", "layout");
    redirect("/student/internship?flash=applied");
  });
}

export async function withdrawAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { student } = await context("application.withdraw");
    await withdrawApplication(student.userId, str(form, "applicationId") ?? "");
    revalidatePath("/student", "layout");
    return "Application withdrawn.";
  });
}

export async function submitTaskAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { student, actor } = await context("task.submit");
    await submitTask(student.userId, {
      taskId: str(form, "taskId") as string, githubUrl: str(form, "githubUrl"), liveUrl: str(form, "liveUrl"),
      explanation: str(form, "explanation"), textAnswer: str(form, "textAnswer"), hoursSpent: num(form, "hoursSpent"),
    } as never, actor);
    revalidatePath("/student", "layout");
    redirect(`/student/tasks/${str(form, "taskId")}?flash=task_submitted`);
  });
}

export async function selectProjectAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { student, actor } = await context("project.select");
    await selectProject(student.userId, { applicationId: str(form, "applicationId") as string, projectId: str(form, "projectId") as string }, actor);
    revalidatePath("/student", "layout");
    redirect("/student/projects?flash=project_selected");
  });
}

export async function submitProjectAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { student, actor } = await context("project.submit");
    await submitProject(student.userId, str(form, "applicationId") as string, {
      projectId: str(form, "projectId") as string, githubUrl: str(form, "githubUrl") as string, liveUrl: str(form, "liveUrl"), notes: str(form, "notes"),
    } as never, actor);
    revalidatePath("/student", "layout");
    redirect("/student/projects?flash=project_submitted");
  });
}

const profileSchema = studentRegistrationSchema
  .omit({ email: true, termsAccepted: true, privacyAccepted: true, githubUrl: true })
  .extend({ githubUrl: githubProfileUrlSchema.optional() });

export async function updateProfileAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { student } = await context("profile.update");
    const data = profileSchema.parse({
      fullName: str(form, "fullName"), mobile: str(form, "mobile"), college: str(form, "college"), university: str(form, "university"),
      degree: str(form, "degree"), branch: str(form, "branch"), yearOfStudy: str(form, "yearOfStudy"), graduationYear: str(form, "graduationYear"),
      preferredDomainId: str(form, "preferredDomainId"),
      state: str(form, "state"), city: str(form, "city"), country: str(form, "country") ?? "India",
      githubUrl: str(form, "githubUrl") ?? "", linkedinUrl: str(form, "linkedinUrl") ?? "", resumeFileId: strList(form, "resumeFileId")[0],
    });
    const { resumeFileId, ...rest } = data;
    const activeDomain = await getPrisma().domain.findFirst({ where: { id: data.preferredDomainId, isActive: true }, select: { id: true } });
    if (!activeDomain) throw new z.ZodError([{ code: "custom", path: ["preferredDomainId"], message: "Choose an active internship domain." }]);
    if (resumeFileId) {
      const file = await getPrisma().fileAsset.findFirst({ where: { id: resumeFileId, ownerUserId: student.userId, purpose: "RESUME", deletedAt: null }, select: { id: true } });
      if (!file) throw new z.ZodError([{ code: "custom", path: ["resumeFileId"], message: "That resume file is not available." }]);
    }
    await getPrisma().studentProfile.update({ where: { userId: student.userId }, data: { ...rest, ...(resumeFileId ? { resumeFileId } : {}) } });
    await getPrisma().user.update({ where: { id: student.userId }, data: { name: data.fullName } });
    revalidatePath("/student", "layout");
    return "Profile updated.";
  });
}

export async function markNotificationAction(form: FormData): Promise<void> {
  const { student } = await context("notifications.mark_read");
  const id = str(form, "id");
  if (id) await markRead(student.userId, id);
  else await markAllRead(student.userId);
  revalidatePath("/student", "layout");
}

export async function signOutEverywhereAction(): Promise<void> {
  const { student } = await context("sessions.sign_out_everywhere");
  await getPrisma().session.updateMany({ where: { userId: student.userId, kind: "STUDENT", revokedAt: null }, data: { revokedAt: new Date(), revokedReason: "signed_out_everywhere" } });
  await clearSessionCookie("STUDENT");
  redirect("/login");
}
