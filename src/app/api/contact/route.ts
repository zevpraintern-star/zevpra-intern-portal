import { RateLimitError } from "@/lib/api/errors";
import { route } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/response";
import { getPrisma } from "@/lib/db/prisma";
import { consumeRateLimit, rateLimits } from "@/lib/redis/rate-limit";
import { verifyTurnstile } from "@/lib/security/turnstile";
import { contactMessageSchema } from "@/lib/validation/contact";

/** Stores the message (as inert text: it is escaped on render) after anti-spam checks. */
export const POST = route(async (req, _ctx, meta) => {
  const limit = await consumeRateLimit(rateLimits.contact(meta.ipAddress));
  if (!limit.allowed) throw new RateLimitError("Too many messages. Please try again later.", limit.retryAfterSeconds);

  const body = contactMessageSchema.parse(await req.json());
  // A filled honeypot means a bot: pretend success so it learns nothing.
  if (body.honeypot) return apiSuccess({ received: true });
  await verifyTurnstile(body.turnstileToken, meta.ipAddress);

  await getPrisma().contactMessage.create({
    data: { name: body.name, email: body.email.toLowerCase(), subject: body.subject, message: body.message, ipAddress: meta.ipAddress.slice(0, 45), userAgent: meta.userAgent },
  });
  return apiSuccess({ received: true }, { status: 201 });
});
