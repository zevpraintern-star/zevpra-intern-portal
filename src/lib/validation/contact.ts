import { z } from "zod";

import { emailSchema, personNameSchema, requiredTextSchema } from "./common";

/**
 * Public contact form. Spam is handled with layered controls (rate limiting,
 * schema strictness, a honeypot field and optional Turnstile) rather than CAPTCHA
 * on every page. Messages are stored, never emailed straight through, so they can
 * be triaged in the admin panel.
 */

export const contactMessageSchema = z.object({
  name: personNameSchema,
  email: emailSchema,
  subject: requiredTextSchema(160, 3),
  message: requiredTextSchema(4000, 20),
  /** Must stay empty: only automated bots fill a hidden field. */
  honeypot: z.string().max(0, "Invalid submission.").optional(),
  turnstileToken: z.string().trim().max(4096).optional(),
});

export type ContactMessageInput = z.infer<typeof contactMessageSchema>;

export const contactStatusSchema = z.enum(["NEW", "IN_REVIEW", "RESOLVED", "SPAM"]);
export type ContactStatusInput = z.infer<typeof contactStatusSchema>;
