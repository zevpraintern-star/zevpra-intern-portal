import { RateLimitError, UnauthenticatedError } from "@/lib/api/errors";
import { route } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/response";
import { requestOtp } from "@/lib/auth/otp-service";
import { getPrisma } from "@/lib/db/prisma";
import { consumeRateLimit, rateLimits } from "@/lib/redis/rate-limit";
import { hashPassword, verifyPassword } from "@/lib/security/crypto";
import { verifyTurnstile } from "@/lib/security/turnstile";
import { adminLoginSchema } from "@/lib/validation/auth";
import { securityEvent } from "@/server/services/audit";

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
let dummyHash: Promise<string> | null = null;

/**
 * Admin sign-in, step 1 of 2: password. A correct password triggers an emailed one-time
 * code (step 2, /verify). Unknown emails take the same time and return the same error as
 * wrong passwords, so the endpoint reveals nothing about which accounts exist.
 */
export const POST = route(async (req, _ctx, meta) => {
  const body = adminLoginSchema.parse(await req.json());
  if (body.honeypot) throw new UnauthenticatedError("Invalid email or password.");
  await verifyTurnstile(body.turnstileToken, meta.ipAddress);
  const email = body.email.trim().toLowerCase();

  for (const identifier of [meta.ipAddress, email]) {
    const limit = await consumeRateLimit(rateLimits.adminLogin(identifier));
    if (!limit.allowed) throw new RateLimitError("Too many sign-in attempts. Please try again later.", limit.retryAfterSeconds);
  }

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, status: true, passwordHash: true, failedLoginCount: true, lockedUntil: true, roles: { select: { role: { select: { key: true } } } } },
  });
  const isStaff = Boolean(user?.roles.some((r) => ["MENTOR", "ADMIN", "SUPER_ADMIN"].includes(r.role.key)));

  if (user?.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    throw new RateLimitError("This account is temporarily locked after repeated failures. Try again later.", Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000));
  }

  dummyHash ??= hashPassword("not-a-real-password-for-timing");
  const passwordOk = await verifyPassword(body.password, user?.passwordHash ?? (await dummyHash));

  if (!user || !isStaff || user.status !== "ACTIVE" || !user.passwordHash || !passwordOk) {
    if (user && isStaff) {
      const failures = user.failedLoginCount + 1;
      const lock = failures >= MAX_FAILURES;
      await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: failures, ...(lock ? { lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000), failedLoginCount: 0 } : {}) } });
      if (failures >= 3) await securityEvent("SUSPICIOUS_ADMIN_LOGIN", lock ? "HIGH" : "MEDIUM", { userId: user.id, email, ipAddress: meta.ipAddress, userAgent: meta.userAgent, detail: { failures, locked: lock } });
    }
    throw new UnauthenticatedError("Invalid email or password.");
  }

  await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
  const otp = await requestOtp({ email, purpose: "ADMIN_LOGIN", ipAddress: meta.ipAddress, userAgent: meta.userAgent });
  return apiSuccess({ otpRequired: true, maskedEmail: otp.maskedEmail });
});
