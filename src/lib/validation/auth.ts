import { z } from "zod";

import { emailSchema } from "./common";

/**
 * Authentication inputs.
 *
 * The `purpose` field is part of the schema so a verification code issued for one
 * flow can never be used in another (the code digest is bound to it server side).
 */

export const OTP_PURPOSES = ["STUDENT_REGISTER", "STUDENT_LOGIN", "ADMIN_LOGIN"] as const;
export type OtpRequestPurpose = (typeof OTP_PURPOSES)[number];

/** Honeypot + optional Turnstile token: layered anti-bot without CAPTCHA everywhere. */
const antiBotFields = {
  honeypot: z.string().max(0, "Invalid submission.").optional(),
  turnstileToken: z.string().trim().max(4096).optional(),
};

export const otpRequestSchema = z.object({
  email: emailSchema,
  purpose: z.enum(OTP_PURPOSES).default("STUDENT_REGISTER"),
  ...antiBotFields,
});

export type OtpRequestInput = z.infer<typeof otpRequestSchema>;

export const otpVerifySchema = z.object({
  email: emailSchema,
  purpose: z.enum(OTP_PURPOSES).default("STUDENT_REGISTER"),
  code: z
    .string()
    .trim()
    .regex(/^\d{4,10}$/, "Enter the numeric code from your email."),
});

export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;

/** Admin sign-in uses email plus password (never email OTP) and is rate limited. */
export const adminLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password.").max(128),
  ...antiBotFields,
});

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

export const sessionIdSchema = z.string().uuid("Invalid session identifier.");
