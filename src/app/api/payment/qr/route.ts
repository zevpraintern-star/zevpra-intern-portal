import { NextResponse } from "next/server";

import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/lib/api/errors";
import { route } from "@/lib/api/handler";
import { can, loadStaffContext } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { loadPrivateFile } from "@/lib/storage/storage-service";
import { getPaymentSettings } from "@/server/services/settings";

/**
 * The UPI QR is shown only to students who have become certificate-eligible, and to
 * staff who manage settings (so they can preview what students see).
 */
export const GET = route(async () => {
  const [student, admin] = await Promise.all([getSession("STUDENT"), getSession("ADMIN")]);
  if (!student && !admin) throw new UnauthenticatedError();

  let allowed = false;
  if (student) allowed = (await getPrisma().application.count({ where: { studentId: student.user.id, certificateEligibleAt: { not: null } } })) > 0;
  if (!allowed && admin) {
    const staff = await loadStaffContext(admin);
    allowed = Boolean(staff && can(staff, "settings.manage"));
  }
  if (!allowed) throw new ForbiddenError();

  const { qrFileId } = await getPaymentSettings();
  if (!qrFileId) throw new NotFoundError("The payment QR code has not been configured yet.");
  const { asset, body } = await loadPrivateFile(qrFileId);
  return new NextResponse(new Uint8Array(body), { headers: { "Content-Type": asset.mimeType, "Cache-Control": "private, max-age=60", "X-Content-Type-Options": "nosniff" } });
});
