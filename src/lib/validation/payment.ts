import { z } from "zod";

import { plainTextSchema, requiredTextSchema, utrSchema, uuidSchema } from "./common";

/**
 * Manual UPI certificate payment (specification sections 28 to 32).
 *
 * There is no payment gateway. A student pays by UPI, then submits a screenshot
 * plus the UTR. That submission only moves the record to UNDER_REVIEW. A
 * certificate is generated exclusively by an authorised admin approval, which is
 * enforced in the payment service and can never be triggered by this schema.
 */

export const paymentStatusSchema = z.enum([
  "NOT_SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
]);

export const paymentProofSchema = z.object({
  /** Application (enrollment) the certificate payment belongs to. */
  applicationId: uuidSchema,
  utr: utrSchema,
  payerName: requiredTextSchema(160, 3).optional(),
  upiIdUsed: plainTextSchema(160).optional(),
  remarks: plainTextSchema(1000).optional(),
  /** FileAsset id returned by the upload endpoint; the screenshot itself is private. */
  screenshotFileId: uuidSchema,
  /** Optional explicit confirmation that the amount matches the displayed fee. */
  amountConfirmed: z.literal(true, {
    message: "Confirm that you paid the exact certificate fee.",
  }),
});

export type PaymentProofInput = z.infer<typeof paymentProofSchema>;

export const paymentReviewSchema = z
  .object({
    paymentRequestId: uuidSchema,
    decision: z.enum(["APPROVED", "REJECTED"]),
    /** Rejection always requires a reason that is shown to the student. */
    reason: requiredTextSchema(1000, 10).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.decision === "REJECTED" && !value.reason) {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "A rejection reason is required and will be shared with the student.",
      });
    }
  });

export type PaymentReviewInput = z.infer<typeof paymentReviewSchema>;

/** Admin-editable payment settings (app_settings backed). */
export const paymentSettingsSchema = z.object({
  certificateFee: z.coerce
    .number()
    .min(1, "The certificate fee must be at least 1.")
    .max(100_000, "The certificate fee looks too high."),
  currency: z.string().trim().length(3).toUpperCase().default("INR"),
  upiId: z
    .string()
    .trim()
    .max(160)
    .regex(/^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/, "Enter a valid UPI ID, e.g. name@bank.")
    .or(z.literal("")),
  upiPayeeName: plainTextSchema(160).optional(),
  /** FileAsset id of the uploaded QR image; never a public URL. */
  upiQrFileId: uuidSchema.optional(),
  instructions: requiredTextSchema(2000, 20).optional(),
});

export type PaymentSettingsInput = z.infer<typeof paymentSettingsSchema>;

/**
 * Certificate verification lookup. Accepts either the human readable certificate
 * ID (CERT-XXXXXXXX) or the opaque verification id used in the public URL.
 */
export const certificateVerificationLookupSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(6, "Enter a certificate ID or verification code.")
    .max(64, "That identifier is too long.")
    .regex(/^[A-Za-z0-9-]+$/, "Certificates use letters, numbers and hyphens only."),
});

export type CertificateVerificationLookupInput = z.infer<
  typeof certificateVerificationLookupSchema
>;
