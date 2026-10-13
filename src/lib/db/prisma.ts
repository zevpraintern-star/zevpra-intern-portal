import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "../config/env";

/**
 * Prisma Client singleton.
 *
 * Prisma ORM 7 is Rust-free and connects through a JavaScript driver adapter, so
 * the connection string is supplied here rather than in schema.prisma. The client
 * is created lazily: importing this module never opens a connection, which keeps
 * `next build` and unit tests fast and allows the app to boot without a database
 * for pages that do not query it.
 *
 * Query parameters are always sent as bound parameters by Prisma, which is what
 * makes the parameterised-query guarantees in docs/SECURITY.md hold.
 */

type PrismaClientInstance = InstanceType<typeof PrismaClient>;

const globalForPrisma = globalThis as unknown as {
  __internshipPortalPrisma?: PrismaClientInstance;
};

function createPrismaClient(): PrismaClientInstance {
  const env = getEnv();
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    max: env.PG_POOL_MAX,
    connectionTimeoutMillis: env.PG_CONNECTION_TIMEOUT_MS,
  });

  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export function getPrisma(): PrismaClientInstance {
  const existing = globalForPrisma.__internshipPortalPrisma;
  if (existing) return existing;

  const client = createPrismaClient();
  // Cached on globalThis so Next.js hot reload does not exhaust the connection pool.
  globalForPrisma.__internshipPortalPrisma = client;
  return client;
}

export async function disconnectPrisma(): Promise<void> {
  const existing = globalForPrisma.__internshipPortalPrisma;
  if (!existing) return;
  await existing.$disconnect();
  globalForPrisma.__internshipPortalPrisma = undefined;
}

/** Health check used by /api/health. Never exposes connection details. */
export async function pingDatabase(): Promise<boolean> {
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
