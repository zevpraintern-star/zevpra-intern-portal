import type { Prisma } from "@/generated/prisma/client";
import type { AuditAction, SecurityEventType, SecuritySeverity } from "@/generated/prisma/enums";
import { AUDIT } from "@/lib/config/constants";
import { getPrisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";

type Json = Prisma.InputJsonValue;

export interface Actor {
  userId?: string | null;
  role?: string | null;
  ipAddress?: string;
  userAgent?: string;
}

/** Recursively replaces secret-looking keys so they can never reach the audit table. */
export function redact(value: unknown, depth = 0): Json {
  if (value === null || value === undefined) return null as unknown as Json;
  if (depth > 5) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, depth + 1)) as Json;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const output: Record<string, Json> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      const secret = (AUDIT.redactedKeys as readonly string[]).some((k) => key.toLowerCase().includes(k.toLowerCase()));
      output[key] = secret ? "[redacted]" : redact(inner, depth + 1);
    }
    return output;
  }
  if (typeof value === "string") return value.slice(0, 1000);
  return value as Json;
}

/** Audit writes must never break the business action they describe. */
export async function audit(
  actor: Actor,
  action: AuditAction,
  entityType: string,
  entityId?: string | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await getPrisma().auditLog.create({
      data: {
        actorUserId: actor.userId ?? null,
        actorRole: actor.role ?? null,
        action,
        entityType,
        entityId: entityId ?? null,
        ipAddress: actor.ipAddress?.slice(0, 45),
        userAgent: actor.userAgent?.slice(0, 400),
        metadata: metadata ? redact(metadata) : undefined,
      },
    });
  } catch (error) {
    logger.error("[audit] write failed", { action, error: error instanceof Error ? error.message : "unknown" });
  }
}

export async function securityEvent(
  type: SecurityEventType,
  severity: SecuritySeverity,
  context: { userId?: string | null; email?: string; ipAddress?: string; userAgent?: string; detail?: Record<string, unknown> },
): Promise<void> {
  try {
    await getPrisma().securityEvent.create({
      data: {
        type,
        severity,
        userId: context.userId ?? null,
        email: context.email?.slice(0, 255),
        ipAddress: context.ipAddress?.slice(0, 45),
        userAgent: context.userAgent?.slice(0, 400),
        detail: context.detail ? redact(context.detail) : undefined,
      },
    });
  } catch (error) {
    logger.error("[security] event write failed", { type, error: error instanceof Error ? error.message : "unknown" });
  }
}
