import { UnauthenticatedError, ValidationError } from "@/lib/api/errors";
import { route } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/response";
import { getSession } from "@/lib/auth/session";
import { securityEvent } from "@/server/services/audit";

/** Records authenticated dashboard page views; request bodies contain only a pathname. */
export const POST = route(async (req, _ctx, meta) => {
  const body = await req.json() as { path?: unknown };
  if (typeof body.path !== "string" || body.path.length > 300 || body.path.includes("?")) {
    throw new ValidationError("Invalid activity path.");
  }
  const [student, admin] = await Promise.all([getSession("STUDENT"), getSession("ADMIN")]);
  const session = student ?? admin;
  if (!session) throw new UnauthenticatedError();

  const isAdmin = Boolean(admin);
  const allowedPrefix = isAdmin ? "/admin" : "/student";
  if (!body.path.startsWith(`${allowedPrefix}/`)) throw new ValidationError("Invalid activity path.");
  const role = isAdmin
    ? session.user.roles.some((item) => item.role.key === "SUPER_ADMIN") ? "SUPER_ADMIN"
      : session.user.roles.some((item) => item.role.key === "ADMIN") ? "ADMIN" : "MENTOR"
    : "STUDENT";
  await securityEvent("USER_ACTIVITY", "LOW", {
    userId: session.user.id,
    email: session.user.email,
    ...meta,
    detail: { path: body.path, role, outcome: "viewed" },
  });
  return apiSuccess({ recorded: true });
});
