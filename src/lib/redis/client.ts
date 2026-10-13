import { Redis } from "ioredis";

import { getEnv } from "../config/env";

/**
 * Redis is the shared store for OTP throttling, rate limiting and short-lived
 * authentication state.
 *
 * Availability rules
 *  - Production: REDIS_URL is mandatory (enforced by src/lib/config/env.ts).
 *  - Development/test: when REDIS_URL is absent the application falls back to an
 *    in-process store (see rate-limit.ts) and logs a warning once. That fallback
 *    is a development convenience only and is refused in production.
 */

const globalForRedis = globalThis as unknown as {
  __internshipPortalRedis?: Redis | null;
  __internshipPortalRedisWarned?: boolean;
};

export function isRedisConfigured(): boolean {
  return Boolean(getEnv().REDIS_URL);
}

function createRedisClient(url: string): Redis {
  const env = getEnv();
  return new Redis(url, {
    keyPrefix: env.REDIS_PREFIX,
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    connectTimeout: 5000,
    ...(env.REDIS_TLS ? { tls: { rejectUnauthorized: true } } : {}),
  });
}

/** Returns the shared client, or null when Redis is not configured. */
export function getRedisOrNull(): Redis | null {
  const env = getEnv();
  if (!env.REDIS_URL) {
    if (!globalForRedis.__internshipPortalRedisWarned) {
      console.warn(
        "[redis] REDIS_URL is not set - using the in-memory development fallback. This is not allowed in production.",
      );
      globalForRedis.__internshipPortalRedisWarned = true;
    }
    return null;
  }

  if (!globalForRedis.__internshipPortalRedis) {
    globalForRedis.__internshipPortalRedis = createRedisClient(env.REDIS_URL);
  }
  return globalForRedis.__internshipPortalRedis;
}

/** Returns the shared client or throws when Redis is not configured. */
export function getRedis(): Redis {
  const client = getRedisOrNull();
  if (!client) {
    throw new Error(
      "Redis is not configured. Set REDIS_URL, or use the explicit in-memory fallback for development.",
    );
  }
  return client;
}

export async function pingRedis(): Promise<boolean> {
  const client = getRedisOrNull();
  if (!client) return false;
  try {
    const reply = await client.ping();
    return reply === "PONG";
  } catch {
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  const client = globalForRedis.__internshipPortalRedis;
  if (!client) return;
  try {
    await client.quit();
  } catch {
    client.disconnect();
  } finally {
    globalForRedis.__internshipPortalRedis = null;
  }
}
