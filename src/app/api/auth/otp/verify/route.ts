import { NotFoundError, RateLimitError, ValidationError } from "@/lib/api/errors";
import { route } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/response";
import { verifyOtp } from "@/lib/auth/otp-service";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { consumeRateLimit, rateLimits } from "@/lib/redis/rate-limit";
import { otpVerifySchema } from "@/lib/validation/auth";

export const POST = route(async (req, _ctx, meta) => {
  const parsed = otpVerifySchema.parse(await req.json());
  if (parsed.purpose === "ADMIN_LOGIN") throw new ValidationError("Unsupported request.");

  const limit = await consumeRateLimit(rateLimits.otpVerify(meta.ipAddress));
  if (!limit.allowed) throw new RateLimitError("Too many attempts. Please try again later.", limit.retryAfterSeconds);

  const result = await verifyOtp({ email: parsed.email, code: parsed.code, purpose: parsed.purpose, ipAddress: meta.ipAddress });

  if (parsed.purpose !== "STUDENT_LOGIN") {
    return apiSuccess({ message: "Code verified successfully", verified: true, email: parsed.email });
  }

  const user = await getPrisma().user.findUnique({
    where: { email: parsed.email.trim().toLowerCase() },
    select: { id: true, status: true, roles: { select: { role: { select: { key: true } } } } },
  });
  const userId = result.userId ?? user?.id;
  if (!userId || !user) throw new NotFoundError("No student account was found for this email. Please register first.");
  if (user.status !== "ACTIVE") throw new ValidationError("This account is not active. Please contact support.");
  if (!user.roles.some((r) => r.role.key === "STUDENT")) throw new ValidationError("This email is not registered as a student account.");

  await getPrisma().user.update({ where: { id: userId }, data: { lastLoginAt: new Date(), lastLoginIp: meta.ipAddress.slice(0, 45), failedLoginCount: 0 } });
  const { token } = await createSession({ userId, kind: "STUDENT", ipAddress: meta.ipAddress, userAgent: meta.userAgent });
  await setSessionCookie(token, "STUDENT");
  return apiSuccess({ message: "Signed in successfully", authenticated: true });
});
