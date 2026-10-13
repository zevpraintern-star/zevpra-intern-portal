import { NextResponse } from "next/server";

import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/lib/api/errors";
import { route } from "@/lib/api/handler";
import { can, loadStaffContext, type StaffContext } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { uuidSchema } from "@/lib/validation/common";
import { createSignedDownloadUrl } from "@/lib/storage/storage-service";

const STAFF_PERMISSION: Record<string, string> = {
  PAYMENT_SCREENSHOT: "payments.view",
  TASK_SUBMISSION: "tasks.review",
  PROJECT_FILE: "projects.review",
  PROJECT_SCREENSHOT: "projects.review",
  CERTIFICATE_PDF: "payments.view",
  RESUME: "students.view",
  AVATAR: "students.view",
  CERTIFICATE_TEMPLATE: "settings.manage",
  PAYMENT_QR: "settings.manage",
};

/**
 * Private file access. Every request re-checks ownership/permission, then redirects to a
 * short-lived signed URL. A guessed file id alone never yields the file.
 */
export const GET = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const { id } = await ctx.params;
  const fileId = uuidSchema.safeParse(id);
  if (!fileId.success) throw new NotFoundError("File not found.");

  const [student, adminSession] = await Promise.all([getSession("STUDENT"), getSession("ADMIN")]);
  if (!student && !adminSession) throw new UnauthenticatedError();

  const asset = await getPrisma().fileAsset.findFirst({ where: { id: fileId.data, deletedAt: null }, select: { id: true, ownerUserId: true, purpose: true, scanStatus: true } });
  if (!asset) throw new NotFoundError("File not found.");
  if (asset.scanStatus === "INFECTED") throw new ForbiddenError();

  let allowed = student?.user.id === asset.ownerUserId;
  if (!allowed && adminSession) {
    const staff: StaffContext | null = await loadStaffContext(adminSession);
    const needed = STAFF_PERMISSION[asset.purpose];
    allowed = Boolean(staff && needed && can(staff, needed));
  }
  if (!allowed) throw new NotFoundError("File not found."); // do not reveal that the id exists

  const url = await createSignedDownloadUrl(asset.id, 120);
  const target = url.startsWith("/") ? new URL(url, req.url) : url;
  const response = NextResponse.redirect(target, 302);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
});
