import { ValidationError } from "@/lib/api/errors";
import { route } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/response";
import { requestOtp } from "@/lib/auth/otp-service";
import { verifyTurnstile } from "@/lib/security/turnstile";
import { otpRequestSchema } from "@/lib/validation/auth";

/** Public OTP issuance. Admin codes are NOT issued here: they require a correct password first. */
export const POST = route(async (req, _ctx, meta) => {
  const parsed = otpRequestSchema.parse(await req.json());
  if (parsed.honeypot) return apiSuccess({ message: "If that address is valid, a code is on its way." });
  if (parsed.purpose === "ADMIN_LOGIN") throw new ValidationError("Unsupported request.");
  await verifyTurnstile(parsed.turnstileToken, meta.ipAddress);

  const result = await requestOtp({ email: parsed.email, purpose: parsed.purpose, ipAddress: meta.ipAddress, userAgent: meta.userAgent });
  return apiSuccess({ message: `A verification code has been sent to ${result.maskedEmail}`, maskedEmail: result.maskedEmail });
});
