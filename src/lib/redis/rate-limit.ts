import { createHash } from "node:crypto";

import { getEnv } from "../config/env";
import { getRedisOrNull } from "./client";

/**
 * Fixed-window rate limiting backed by Redis, with an explicit in-process
 * fallback for local development when REDIS_URL is not configured.
 *
 * Design notes
 *  - Identifiers (email, IP, user id) are hashed before they become part of a key,
 *    so no personal data is stored in Redis and keys stay bounded in length.
 *  - Every limit and window comes from the environment (see .env.example).
 *  - The fallback store is per process and is refused in production, because a
 *    multi-instance deployment would silently weaken the limits.
 */

export interface RateLimitRule {
  /** Logical bucket, e.g. "otp-request". */
  name: string;
  /** Maximum requests allowed inside the window. */
  limit: number;
  /** Window size in seconds. */
  windowSeconds: number;
  /** Stable identifier: hashed email, IP address or user id. */
  identifier: string;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  /** True when Redis was unavailable and the in-memory fallback was used. */
  usedFallback: boolean;
}

interface MemoryBucket {
  count: number;
  resetAt: number;
}

const globalForRateLimit = globalThis as unknown as {
  __internshipPortalMemoryBuckets?: Map<string, MemoryBucket>;
};

function memoryBuckets(): Map<string, MemoryBucket> {
  if (!globalForRateLimit.__internshipPortalMemoryBuckets) {
    globalForRateLimit.__internshipPortalMemoryBuckets = new Map<string, MemoryBucket>();
  }
  return globalForRateLimit.__internshipPortalMemoryBuckets;
}

export function hashIdentifier(identifier: string): string {
  return createHash("sha256").update(identifier.trim().toLowerCase()).digest("hex").slice(0, 32);
}

function buildKey(rule: Pick<RateLimitRule, "name" | "identifier">): string {
  return `rl:${rule.name}:${hashIdentifier(rule.identifier)}`;
}

function consumeMemory(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  const store = memoryBuckets();

  // Opportunistic cleanup keeps the map from growing without bound.
  if (store.size > 5000) {
    for (const [bucketKey, bucket] of store) {
      if (bucket.resetAt <= now) store.delete(bucketKey);
    }
  }

  const existing = store.get(key);
  const bucket =
    existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + windowSeconds * 1000 };
  bucket.count += 1;
  store.set(key, bucket);

  return {
    allowed: bucket.count <= limit,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    usedFallback: true,
  };
}

export async function consumeRateLimit(rule: RateLimitRule): Promise<RateLimitResult> {
  const env = getEnv();
  const key = buildKey(rule);
  const client = getRedisOrNull();

  if (!client) {
    if (env.NODE_ENV === "production") {
      throw new Error(
        "Rate limiting requires Redis in production. Configure REDIS_URL before serving traffic.",
      );
    }
    return consumeMemory(key, rule.limit, rule.windowSeconds);
  }

  try {
    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, rule.windowSeconds);
    }
    const ttl = await client.ttl(key);
    const retryAfterSeconds = ttl > 0 ? ttl : rule.windowSeconds;

    return {
      allowed: count <= rule.limit,
      limit: rule.limit,
      remaining: Math.max(0, rule.limit - count),
      retryAfterSeconds,
      usedFallback: false,
    };
  } catch (error) {
    if (env.NODE_ENV === "production") {
      // Fail closed: an unreachable limiter must not silently disable abuse protection.
      throw new Error(
        `Rate limiter unavailable: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
    console.warn("[rate-limit] Redis error, using development fallback:", error);
    return consumeMemory(key, rule.limit, rule.windowSeconds);
  }
}

/** Clears a bucket, e.g. after a successful login so old failures do not linger. */
export async function resetRateLimit(
  rule: Pick<RateLimitRule, "name" | "identifier">,
): Promise<void> {
  const key = buildKey(rule);
  const client = getRedisOrNull();
  if (!client) {
    memoryBuckets().delete(key);
    return;
  }
  try {
    await client.del(key);
  } catch (error) {
    console.warn("[rate-limit] failed to reset bucket:", error);
  }
}

/**
 * Rate limit catalogue: one entry per protected surface so limits are never
 * duplicated inline inside route handlers.
 */
export const rateLimits = {
  otpRequest(identifier: string): RateLimitRule {
    const env = getEnv();
    return {
      name: "otp-request",
      identifier,
      limit: env.RL_OTP_REQUEST_LIMIT,
      windowSeconds: env.RL_OTP_REQUEST_WINDOW_MINUTES * 60,
    };
  },
  otpVerify(identifier: string): RateLimitRule {
    const env = getEnv();
    return {
      name: "otp-verify",
      identifier,
      limit: env.RL_OTP_VERIFY_LIMIT,
      windowSeconds: env.RL_OTP_VERIFY_WINDOW_MINUTES * 60,
    };
  },
  register(identifier: string): RateLimitRule {
    const env = getEnv();
    return {
      name: "register",
      identifier,
      limit: env.RL_REGISTER_LIMIT,
      windowSeconds: env.RL_REGISTER_WINDOW_MINUTES * 60,
    };
  },
  login(identifier: string): RateLimitRule {
    const env = getEnv();
    return {
      name: "login",
      identifier,
      limit: env.RL_LOGIN_LIMIT,
      windowSeconds: env.RL_LOGIN_WINDOW_MINUTES * 60,
    };
  },
  adminLogin(identifier: string): RateLimitRule {
    const env = getEnv();
    return {
      name: "admin-login",
      identifier,
      limit: env.RL_ADMIN_LOGIN_LIMIT,
      windowSeconds: env.RL_ADMIN_LOGIN_WINDOW_MINUTES * 60,
    };
  },
  certificateVerify(identifier: string): RateLimitRule {
    const env = getEnv();
    return {
      name: "certificate-verify",
      identifier,
      limit: env.RL_CERTIFICATE_VERIFY_LIMIT,
      windowSeconds: env.RL_CERTIFICATE_VERIFY_WINDOW_MINUTES * 60,
    };
  },
  paymentProof(identifier: string): RateLimitRule {
    const env = getEnv();
    return {
      name: "payment-proof",
      identifier,
      limit: env.RL_PAYMENT_PROOF_LIMIT,
      windowSeconds: env.RL_PAYMENT_PROOF_WINDOW_MINUTES * 60,
    };
  },
  contact(identifier: string): RateLimitRule {
    const env = getEnv();
    return {
      name: "contact",
      identifier,
      limit: env.RL_CONTACT_LIMIT,
      windowSeconds: env.RL_CONTACT_WINDOW_MINUTES * 60,
    };
  },
  upload(identifier: string): RateLimitRule {
    const env = getEnv();
    return {
      name: "upload",
      identifier,
      limit: env.RL_UPLOAD_LIMIT,
      windowSeconds: env.RL_UPLOAD_WINDOW_MINUTES * 60,
    };
  },
} as const;

/**
 * Resolves the client IP from proxy headers. Cloudflare supplies
 * cf-connecting-ip; standard proxies use x-forwarded-for.
 */
export function clientIpFromHeaders(headers: Headers): string {
  const cloudflareIp = headers.get("cf-connecting-ip")?.trim();
  if (cloudflareIp) return cloudflareIp;

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}
