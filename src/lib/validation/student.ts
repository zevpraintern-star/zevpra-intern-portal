import { z } from "zod";

import {
  emailSchema,
  githubProfileUrlSchema,
  linkedinUrlSchema,
  organisationNameSchema,
  personNameSchema,
  phoneSchema,
  requiredTextSchema,
  uuidSchema,
  yearSchema,
} from "./common";

/**
 * Student registration (specification section 12) and profile updates.
 *
 * Only information required to run an internship is collected: no Aadhaar,
 * no PAN, no date of birth, no address line, no parent details.
 */

const currentYear = new Date().getFullYear();

export const studentRegistrationSchema = z.object({
  fullName: personNameSchema,
  email: emailSchema,
  mobile: phoneSchema,
  college: organisationNameSchema,
  university: organisationNameSchema.optional(),
  degree: requiredTextSchema(120, 2),
  branch: requiredTextSchema(120, 2),
  yearOfStudy: z.coerce
    .number()
    .int()
    .min(1, "Select your current year of study.")
    .max(6, "Select your current year of study."),
  graduationYear: yearSchema.refine(
    (value) => value >= currentYear - 1 && value <= currentYear + 8,
    "Enter a graduation year within the next 8 years.",
  ),
  state: requiredTextSchema(120, 2).optional(),
  city: requiredTextSchema(120, 2).optional(),
  country: requiredTextSchema(120, 2).default("India"),
  preferredDomainId: uuidSchema.optional(),
  githubUrl: githubProfileUrlSchema.optional(),
  linkedinUrl: z
    .union([linkedinUrlSchema, z.literal("")])
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
  resumeFileId: uuidSchema.optional(),
  termsAccepted: z.literal(true, { message: "Accept the Terms & Conditions to continue." }),
  privacyAccepted: z.literal(true, { message: "Accept the Privacy Policy to continue." }),
});

export type StudentRegistrationInput = z.infer<typeof studentRegistrationSchema>;

/** Profile updates exclude the immutable identity and legal acceptance fields. */
export const studentProfileUpdateSchema = studentRegistrationSchema
  .omit({ email: true, termsAccepted: true, privacyAccepted: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "No changes were submitted.",
  });

export type StudentProfileUpdateInput = z.infer<typeof studentProfileUpdateSchema>;

/** Admin-side creation of a student record (used by the admin panel later). */
export const adminStudentUpdateSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  reviewNote: requiredTextSchema(1000).optional(),
});

export type AdminStudentUpdateInput = z.infer<typeof adminStudentUpdateSchema>;
