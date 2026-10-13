import { route } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/response";
import { clearSessionCookie, getSession, revokeSession } from "@/lib/auth/session";
import { audit } from "@/server/services/audit";

export const POST = route(async (_req, _ctx, meta) => {
  const [student, admin] = await Promise.all([getSession("STUDENT"), getSession("ADMIN")]);
  if (student) {
    await revokeSession(student.id, "student_logout");
    await clearSessionCookie("STUDENT");
  }
  if (admin) {
    await revokeSession(admin.id, "admin_logout");
    await clearSessionCookie("ADMIN");
    await audit({ userId: admin.user.id, role: "ADMIN", ...meta }, "ADMIN_LOGOUT", "User", admin.user.id);
  }
  return apiSuccess({ message: "Logged out successfully" });
});
