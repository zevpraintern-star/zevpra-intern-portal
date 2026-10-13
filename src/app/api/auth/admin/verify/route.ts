import { RateLimitError, UnauthenticatedError } from "@/lib/api/errors";
import { route } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/response";
import { verifyOtp } from "@/lib/auth/otp-service";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { queueEmail } from "@/lib/email/email-service";
import { consumeRateLimit, rateLimits } from "@/lib/redis/rate-limit";
import { otpVerifySchema } from "@/lib/validation/auth";
import { audit, securityEvent } from "@/server/services/audit";
import { kickJobs } from "@/server/jobs/queue";

/** Admin sign-in, step 2 of 2: the emailed code. Only reachable after a correct password. */
export const POST = route(async (req, _ctx, meta) => {
  const body = otpVerifySchema.parse({ ...(await req.json()), purpose: "ADMIN_LOGIN" });
  const limit = await consumeRateLimit(rateLimits.adminLogin(`verify:${meta.ipAddress}`));
  if (!limit.allowed) throw new RateLimitError("Too many attempts. Please try again later.", limit.retryAfterSeconds);

  await verifyOtp({ email: body.email, code: body.code, purpose: "ADMIN_LOGIN", ipAddress: meta.ipAddress });

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { email: body.email.trim().toLowerCase() },
    select: { id: true, name: true, email: true, status: true, lastLoginIp: true, roles: { select: { role: { select: { key: true } } } } },
  });
  const roles = user?.roles.map((r) => r.role.key) ?? [];
  if (!user || user.status !== "ACTIVE" || !roles.some((r) => ["MENTOR", "ADMIN", "SUPER_ADMIN"].includes(r))) throw new UnauthenticatedError("Invalid or expired code.");

  const newNetwork = Boolean(user.lastLoginIp && user.lastLoginIp !== meta.ipAddress);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), lastLoginIp: meta.ipAddress.slice(0, 45), failedLoginCount: 0 } });
  const { token } = await createSession({ userId: user.id, kind: "ADMIN", ipAddress: meta.ipAddress, userAgent: meta.userAgent });
  await setSessionCookie(token, "ADMIN");

  const role = roles.includes("SUPER_ADMIN") ? "SUPER_ADMIN" : roles.includes("ADMIN") ? "ADMIN" : "MENTOR";
  await audit({ userId: user.id, role, ...meta }, "ADMIN_LOGIN", "User", user.id, { newNetwork });
  if (newNetwork) {
    await securityEvent("SUSPICIOUS_ADMIN_LOGIN", "LOW", { userId: user.id, email: user.email, ipAddress: meta.ipAddress, userAgent: meta.userAgent, detail: { reason: "new_network" } });
    await queueEmail({ to: user.email, templateKey: "security_alert", userId: user.id, variables: { recipientName: user.name ?? "Admin", eventDescription: "A sign-in from a new network", ipAddress: meta.ipAddress, occurredAt: new Date().toUTCString() } });
    kickJobs();
  }
  return apiSuccess({ authenticated: true });
});
