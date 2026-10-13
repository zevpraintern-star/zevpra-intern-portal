import { getEnv } from "@/lib/config/env";
import { ValidationError } from "@/lib/api/errors";

/** Cloudflare Turnstile check. A no-op unless TURNSTILE_ENABLED=true, so CAPTCHA is only used where configured. */
export async function verifyTurnstile(token: string | undefined, ip: string): Promise<void> {
  const env = getEnv();
  if (!env.TURNSTILE_ENABLED || !env.TURNSTILE_SECRET_KEY) return;
  if (!token) throw new ValidationError("Please complete the human verification.");
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip });
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(5000) });
  const result = (await response.json()) as { success?: boolean };
  if (!result.success) throw new ValidationError("Human verification failed. Please try again.");
}
