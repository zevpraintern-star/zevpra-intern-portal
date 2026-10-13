import { z } from "zod";

import { GITHUB, PAGINATION, UPLOAD_RULES, UTR } from "../config/constants";

/**
 * Reusable validation primitives.
 *
 * Every server input is validated with these schemas. Frontend validation mirrors
 * them for UX only - it is never trusted (specification section 17).
 */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address.")
  .max(255, "Email address is too long.");

export const personNameSchema = z
  .string()
  .trim()
  .min(2, "Enter at least 2 characters.")
  .max(120, "Name is too long.")
  .regex(/^[\p{L}\p{M}.'\-\s]+$/u, "Use letters, spaces, apostrophes and hyphens only.");

export const organisationNameSchema = z
  .string()
  .trim()
  .min(2, "Enter at least 2 characters.")
  .max(200, "Value is too long.");

/** Indian mobile numbers, optionally prefixed with +91 or 0. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-()]/g, ""))
  .refine((value) => /^(\+91|91|0)?[6-9]\d{9}$/.test(value), {
    message: "Enter a valid 10 digit Indian mobile number.",
  });

/** https-only URLs. Plain http is rejected so uploaded links cannot downgrade. */
export const httpsUrlSchema = z
  .string()
  .trim()
  .max(500, "URL is too long.")
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:";
    } catch {
      return false;
    }
  }, "Enter a valid https:// URL.");

/**
 * GitHub repository URL. The final project hand-in and every project submission
 * require this, so the format is validated strictly: exactly host + owner + repo.
 */
export const githubRepoUrlSchema = z
  .string()
  .trim()
  .max(500, "URL is too long.")
  .refine((value) => {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:") return false;
      if (!GITHUB.hostPattern.test(url.hostname)) return false;
      return /^\/[A-Za-z0-9_.-]{1,39}\/[A-Za-z0-9_.-]{1,100}\/?$/.test(url.pathname);
    } catch {
      return false;
    }
  }, "Enter a public GitHub repository URL, e.g. https://github.com/username/project.")
  .transform((value) => value.replace(/\/+$/, ""));

export const linkedinUrlSchema = z
  .string()
  .trim()
  .max(500, "URL is too long.")
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && /(^|\.)linkedin\.com$/i.test(url.hostname);
    } catch {
      return false;
    }
  }, "Enter a valid LinkedIn profile URL.");

export const uuidSchema = z.string().uuid("Enter a valid identifier.");

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(180)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens only.");

/**
 * UTR / UPI transaction reference. 8-30 alphanumeric characters, reused
 * references are additionally blocked by a unique constraint in the database.
 */
export const utrSchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine((value) => UTR.pattern.test(value), {
    message: "Enter the 8-30 character UTR / transaction ID exactly as shown in your UPI app.",
  });

export const plainTextSchema = (maxLength: number, minimum = 0) => {
  const base = z
    .string()
    .trim()
    .max(maxLength, `Keep this under ${maxLength} characters.`);

  const withMin = minimum > 0 ? base.min(minimum, `Enter at least ${minimum} character(s).`) : base;

  // eslint-disable-next-line no-control-regex
  return withMin
    .refine((value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value), {
      message: "Remove unsupported control characters.",
    })
    // Defence in depth against stored XSS: this app renders text as plain text (React escapes
    // it), and nothing here needs HTML, so any tags are removed at the door as well.
    .transform((value) => value.replace(/<\/?[a-zA-Z!][^>]*>/g, "").trim());
};

export const requiredTextSchema = (maxLength: number, minimum = 1) =>
  plainTextSchema(maxLength, minimum);

/** Admin credentials only. Students never set a password. */
export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(128, "Password is too long.")
  .refine((value) => /[a-z]/.test(value), "Include at least one lowercase letter.")
  .refine((value) => /[A-Z]/.test(value), "Include at least one uppercase letter.")
  .refine((value) => /\d/.test(value), "Include at least one number.")
  .refine((value) => /[^A-Za-z0-9]/.test(value), "Include at least one symbol.");

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGINATION.maxPageSize)
    .default(PAGINATION.defaultPageSize),
  search: plainTextSchema(120).optional(),
  sortBy: plainTextSchema(40).optional(),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

export const yearSchema = z.coerce
  .number()
  .int()
  .min(2000, "Enter a valid year.")
  .max(2100, "Enter a valid year.");

export function buildPageMeta(input: PaginationInput, totalItems: number) {
  const totalPages = Math.max(1, Math.ceil(totalItems / input.pageSize));
  return {
    page: input.page,
    pageSize: input.pageSize,
    totalItems,
    totalPages,
    hasNextPage: input.page < totalPages,
    hasPreviousPage: input.page > 1,
  };
}

/**
 * Uploaded file metadata validation (defence in depth: the storage service
 * re-checks size and MIME type before writing anything).
 */
export const uploadedFileSchema = z.object({
  originalName: z.string().trim().min(1).max(255),
  mimeType: z.enum(UPLOAD_RULES.allowedMimeTypes),
  sizeBytes: z.number().int().positive(),
  extension: z
    .string()
    .trim()
    .toLowerCase()
    .refine(
      (value) => (UPLOAD_RULES.allowedExtensions as readonly string[]).includes(value),
      "This file extension is not allowed.",
    ),
});

export type UploadedFileInput = z.infer<typeof uploadedFileSchema>;

/** Public GitHub *profile* URL (https://github.com/username), as opposed to a repository URL. */
export const githubProfileUrlSchema = z
  .union([
    z
      .string()
      .trim()
      .max(300)
      .refine((value) => {
        try {
          const url = new URL(value);
          return url.protocol === "https:" && /^(www\.)?github\.com$/i.test(url.hostname) && /^\/[A-Za-z0-9-]{1,39}\/?$/.test(url.pathname);
        } catch {
          return false;
        }
      }, "Enter your GitHub profile URL, e.g. https://github.com/username.")
      .transform((value) => value.replace(/\/+$/, "")),
    z.literal(""),
  ])
  .transform((value) => (value === "" ? undefined : value));
