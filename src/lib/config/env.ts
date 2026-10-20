import { z } from "zod";

/**
 * Server environment schema.
 *
 * Every value read at runtime is validated here once, so a misconfigured
 * deployment fails fast with an actionable message instead of throwing deep
 * inside a request handler.
 *
 * Notes
 *  - Secrets are never logged; only the field name appears in validation errors.
 *  - Rate limits, TTLs and fees are configuration, not constants.
 */

/** Treats empty strings as "not provided" so schema defaults apply. */
const emptyToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().trim().optional());
const optionalUrl = z.preprocess(emptyToUndefined, z.string().trim().url().optional());

const positiveInt = (fallback: number) =>
  z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(fallback));

const booleanish = (fallback: boolean) =>
  z.preprocess((value) => {
    const normalised = emptyToUndefined(value);
    if (typeof normalised === "boolean") return normalised;
    if (typeof normalised === "string") {
      return ["1", "true", "yes", "on"].includes(normalised.toLowerCase());
    }
    return normalised;
  }, z.boolean().default(fallback));

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.preprocess(emptyToUndefined, z.string().trim().url().default("http://localhost:3000")),

    // Branding ---------------------------------------------------------------
    COMPANY_NAME: z.preprocess(emptyToUndefined, z.string().trim().default("Zevpra Intern")),
    COMPANY_SHORT_NAME: z.preprocess(emptyToUndefined, z.string().trim().default("Zevpra Intern")),
    COMPANY_LEGAL_NAME: optionalString,
    COMPANY_DOMAIN: z.preprocess(emptyToUndefined, z.string().trim().default("localhost:3000")),
    SUPPORT_EMAIL: z.preprocess(
      emptyToUndefined,
      z.string().trim().email().default("support@example.com"),
    ),
    CONTACT_EMAIL: optionalString,
    PRIMARY_COLOR: z.preprocess(emptyToUndefined, z.string().trim().default("#4f46e5")),
    SECONDARY_COLOR: z.preprocess(emptyToUndefined, z.string().trim().default("#06b6d4")),

    // Database ---------------------------------------------------------------
    DATABASE_URL: z.preprocess(
      (v) => (v || (process.env.VITEST === "true" ? "postgresql://postgres:postgres@localhost:5432/test" : v)),
      z.string().trim().min(1, "DATABASE_URL is required"),
    ),
    DIRECT_URL: optionalString,
    PG_POOL_MAX: positiveInt(10),
    PG_CONNECTION_TIMEOUT_MS: positiveInt(10000),

    // Redis ------------------------------------------------------------------
    REDIS_URL: z.preprocess(
      (v) => {
        if (typeof v !== "string") return v;
        // Strip surrounding quotes/whitespace so a value pasted as `"rediss://..."`
        // (with wrapping quotes, e.g. copied from a quoted snippet) can never
        // corrupt the connection string and produce a connect EINVAL error.
        const cleaned = v.trim().replace(/^["'\s]+|["'\s]+$/g, "");
        return cleaned === "" ? undefined : cleaned;
      },
      z.string().trim().optional(),
    ),
    REDIS_PREFIX: z.preprocess(emptyToUndefined, z.string().trim().default("ip:")),
    REDIS_TLS: booleanish(false),

    // Sessions ---------------------------------------------------------------
    SESSION_SECRET: z.preprocess(
      (v) => (v || (process.env.VITEST === "true" ? "test-session-secret-at-least-32-chars-long-123456" : v)),
      z.string().min(1, "SESSION_SECRET is required"),
    ),
    SESSION_COOKIE_NAME: z.preprocess(emptyToUndefined, z.string().trim().default("ip_session")),
    STUDENT_SESSION_TTL_HOURS: positiveInt(720),
    ADMIN_SESSION_TTL_MINUTES: positiveInt(120),
    SESSION_ROTATE_AFTER_MINUTES: positiveInt(30),

    // OTP --------------------------------------------------------------------
    OTP_TTL_MINUTES: positiveInt(5),
    OTP_LENGTH: z.preprocess(emptyToUndefined, z.coerce.number().int().min(4).max(10).default(6)),
    OTP_MAX_ATTEMPTS: positiveInt(5),
    OTP_RESEND_COOLDOWN_SECONDS: positiveInt(60),
    OTP_MAX_RESENDS_PER_HOUR: positiveInt(5),
    OTP_HASH_PEPPER: optionalString,

    // Rate limits ------------------------------------------------------------
    RL_OTP_REQUEST_LIMIT: positiveInt(5),
    RL_OTP_REQUEST_WINDOW_MINUTES: positiveInt(15),
    RL_OTP_VERIFY_LIMIT: positiveInt(10),
    RL_OTP_VERIFY_WINDOW_MINUTES: positiveInt(15),
    RL_REGISTER_LIMIT: positiveInt(10),
    RL_REGISTER_WINDOW_MINUTES: positiveInt(60),
    RL_LOGIN_LIMIT: positiveInt(10),
    RL_LOGIN_WINDOW_MINUTES: positiveInt(15),
    RL_ADMIN_LOGIN_LIMIT: positiveInt(5),
    RL_ADMIN_LOGIN_WINDOW_MINUTES: positiveInt(15),
    RL_CERTIFICATE_VERIFY_LIMIT: positiveInt(30),
    RL_CERTIFICATE_VERIFY_WINDOW_MINUTES: positiveInt(1),
    RL_PAYMENT_PROOF_LIMIT: positiveInt(5),
    RL_PAYMENT_PROOF_WINDOW_MINUTES: positiveInt(60),
    RL_CONTACT_LIMIT: positiveInt(5),
    RL_CONTACT_WINDOW_MINUTES: positiveInt(60),
    RL_UPLOAD_LIMIT: positiveInt(20),
    RL_UPLOAD_WINDOW_MINUTES: positiveInt(60),

    // Email ------------------------------------------------------------------
    // Delivered exclusively through Brevo (transactional HTTP API). The API key
    // is supplied via the deployment environment and never committed.
    EMAIL_FROM: z.preprocess(
      emptyToUndefined,
      z.string().trim().default("Zevpra Intern <no-reply@example.com>"),
    ),
    EMAIL_REPLY_TO: optionalString,
    BREVO_API_KEY: optionalString,
    BREVO_DAILY_LIMIT: positiveInt(300),

    // Storage ----------------------------------------------------------------
    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    STORAGE_LOCAL_ROOT: z.preprocess(emptyToUndefined, z.string().trim().default("./storage")),
    STORAGE_ENDPOINT: optionalUrl,
    STORAGE_REGION: z.preprocess(emptyToUndefined, z.string().trim().default("auto")),
    STORAGE_BUCKET: optionalString,
    STORAGE_ACCESS_KEY: optionalString,
    STORAGE_SECRET_KEY: optionalString,
    STORAGE_FORCE_PATH_STYLE: booleanish(true),
    SIGNED_URL_TTL_SECONDS: positiveInt(300),
    MAX_UPLOAD_SIZE_MB: positiveInt(5),
    MAX_PAYMENT_SCREENSHOT_KB: positiveInt(300),

    // Payments (manual UPI) ---------------------------------------------------
    UPI_ID: optionalString,
    UPI_PAYEE_NAME: optionalString,
    CERTIFICATE_FEE: positiveInt(50),
    CURRENCY: z.preprocess(emptyToUndefined, z.string().trim().length(3).default("INR")),
    PAYMENT_UPI_QR_STORAGE_KEY: optionalString,

    // Security / monitoring ---------------------------------------------------
    TURNSTILE_ENABLED: booleanish(false),
    TURNSTILE_SECRET_KEY: optionalString,
    SENTRY_DSN: optionalUrl,
    /** Shared secret for POST /api/internal/jobs (cron / external worker trigger). */
    JOB_RUNNER_SECRET: optionalString,
    /** Optional GitHub token: raises the API rate limit for repository checks. */
    GITHUB_TOKEN: optionalString,
    CORS_ALLOWED_ORIGINS: optionalString,
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

    // Seeding -----------------------------------------------------------------
    SEED_SUPER_ADMIN_EMAIL: optionalString,
    SEED_SUPER_ADMIN_NAME: optionalString,
    SEED_SUPER_ADMIN_PASSWORD: optionalString,
    SEED_DEMO_DATA: booleanish(false),
  })
  .superRefine((value, ctx) => {
    const isProd = value.NODE_ENV === "production";
    const isTest = value.NODE_ENV === "test" || process.env.VITEST === "true";
    const isBuildPhase =
      process.env.NEXT_PHASE === "phase-production-build" ||
      process.env.npm_lifecycle_event === "build";

    // In test environment, provide dummy fallbacks if DATABASE_URL or SESSION_SECRET are empty
    if (isTest) {
      if (!value.DATABASE_URL) {
        value.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/test_db";
      }
      if (!value.SESSION_SECRET) {
        value.SESSION_SECRET = "test-session-secret-at-least-32-chars-long-123456";
      }
    }

    // In local development or during static site build (`npm run build`), allow local drivers/fallbacks.
    if (isProd && !isBuildPhase && value.SESSION_SECRET.length < 32) {
      ctx.addIssue({
        code: "custom",
        path: ["SESSION_SECRET"],
        message: "SESSION_SECRET must be at least 32 characters in production.",
      });
    }
    if (isProd && !isBuildPhase && !value.REDIS_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["REDIS_URL"],
        message: "REDIS_URL is required in production: OTP throttling and rate limiting depend on it.",
      });
    }
    if (isProd && !isBuildPhase && value.STORAGE_DRIVER === "local") {
      ctx.addIssue({
        code: "custom",
        path: ["STORAGE_DRIVER"],
        message: "STORAGE_DRIVER=local cannot be used in production; configure S3 or Cloudflare R2.",
      });
    }
    if (value.STORAGE_DRIVER === "s3") {
      const required = ["STORAGE_BUCKET", "STORAGE_ACCESS_KEY", "STORAGE_SECRET_KEY"] as const;
      const missing = required.filter((key) => !value[key]);
      if (missing.length > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["STORAGE_DRIVER"],
          message: `STORAGE_DRIVER=s3 requires: ${missing.join(", ")}`,
        });
      }
    }
    if (isProd && !isBuildPhase && !value.BREVO_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["BREVO_API_KEY"],
        message: "BREVO_API_KEY is required in production to send transactional email via Brevo.",
      });
    }
  });

export type ServerEnv = z.infer<typeof envSchema>;

let cachedEnv: ServerEnv | null = null;

export type EnvSource = Record<string, string | undefined>;

/** Pure parser - exported so tests can validate fixtures without touching process.env. */
export function parseEnv(source: EnvSource): ServerEnv {
  return envSchema.parse(source);
}

export function formatEnvError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
}

/** Validated environment, cached for the lifetime of the process. */
export function getEnv(): ServerEnv {
  if (!cachedEnv) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      throw new Error(`Invalid environment configuration:\n${formatEnvError(result.error)}`);
    }
    cachedEnv = result.data;
  }
  return cachedEnv;
}

/** Test helper: clears the memoised environment. */
export function resetEnvCache(): void {
  cachedEnv = null;
}

export function isProduction(): boolean {
  return getEnv().NODE_ENV === "production";
}

/** Browser-safe configuration. Only NEXT_PUBLIC_* values may appear here. */
export const publicConfig = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "http://localhost:3000",
  turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "",
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "",
} as const;
