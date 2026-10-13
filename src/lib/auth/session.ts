import { cookies } from "next/headers";
import { COOKIE_NAMES, SESSION } from "@/lib/config/constants";
import { getEnv } from "@/lib/config/env";
import { getPrisma } from "@/lib/db/prisma";
import { randomToken, sha256Hex } from "@/lib/security/crypto";
import type { SessionKind } from "@/generated/prisma/enums";

export interface SessionPayload {
  userId: string;
  kind: SessionKind;
  ipAddress?: string;
  userAgent?: string;
}

export interface ActiveSession {
  id: string;
  userId: string;
  kind: SessionKind;
  expiresAt: Date;
  user: {
    id: string;
    email: string;
    name: string | null;
    status: string;
    roles: Array<{ role: { key: string; name: string } }>;
  };
}

/**
 * Creates a new session row in the database and returns the plaintext opaque token.
 * Only the SHA-256 digest of the token is saved in the database.
 */
export async function createSession(payload: SessionPayload): Promise<{ token: string; session: any }> {
  const env = getEnv();
  const token = randomToken(SESSION.tokenBytes);
  const tokenHash = sha256Hex(token);

  const ttlMs =
    payload.kind === "STUDENT"
      ? env.STUDENT_SESSION_TTL_HOURS * 60 * 60 * 1000
      : env.ADMIN_SESSION_TTL_MINUTES * 60 * 1000;

  const expiresAt = new Date(Date.now() + ttlMs);

  const session = await getPrisma().session.create({
    data: {
      userId: payload.userId,
      kind: payload.kind,
      tokenHash,
      ipAddress: payload.ipAddress?.slice(0, 45),
      userAgent: payload.userAgent?.slice(0, 400),
      expiresAt,
    },
  });

  return { token, session };
}

/**
 * Sets the HTTP-only secure session cookie for the response.
 */
export async function setSessionCookie(
  token: string,
  kind: SessionKind,
): Promise<void> {
  const env = getEnv();
  const cookieStore = await cookies();
  const cookieName = kind === "STUDENT" ? COOKIE_NAMES.studentSession : COOKIE_NAMES.adminSession;
  const maxAge =
    kind === "STUDENT"
      ? env.STUDENT_SESSION_TTL_HOURS * 3600
      : env.ADMIN_SESSION_TTL_MINUTES * 60;

  cookieStore.set(cookieName, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

/**
 * Deletes the session cookie from the browser.
 */
export async function clearSessionCookie(kind: SessionKind): Promise<void> {
  const cookieStore = await cookies();
  const cookieName = kind === "STUDENT" ? COOKIE_NAMES.studentSession : COOKIE_NAMES.adminSession;
  cookieStore.delete(cookieName);
}

/**
 * Validates the session token from the cookie or passed token string,
 * checks revocation and expiration, and touches `lastSeenAt` if appropriate.
 */
export async function getSession(
  kind: SessionKind = "STUDENT",
  providedToken?: string,
): Promise<ActiveSession | null> {
  let token = providedToken;
  if (!token) {
    const cookieStore = await cookies();
    const cookieName = kind === "STUDENT" ? COOKIE_NAMES.studentSession : COOKIE_NAMES.adminSession;
    token = cookieStore.get(cookieName)?.value;
  }

  if (!token || typeof token !== "string" || token.length < 16) {
    return null;
  }

  const tokenHash = sha256Hex(token);
  const now = new Date();

  const session = await getPrisma().session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          roles: {
            include: {
              role: {
                select: {
                  key: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!session) return null;
  if (session.kind !== kind) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() <= now.getTime()) return null;
  if (session.user.status !== "ACTIVE") return null;

  // Opportunistic touch interval
  const idleMs = now.getTime() - session.lastSeenAt.getTime();
  if (idleMs > SESSION.touchIntervalMinutes * 60 * 1000) {
    await getPrisma().session.update({
      where: { id: session.id },
      data: { lastSeenAt: now },
    });
  }

  return {
    id: session.id,
    userId: session.userId,
    kind: session.kind,
    expiresAt: session.expiresAt,
    user: session.user,
  };
}

/**
 * Revokes a session by ID.
 */
export async function revokeSession(sessionId: string, reason = "logout"): Promise<void> {
  await getPrisma().session.update({
    where: { id: sessionId },
    data: {
      revokedAt: new Date(),
      revokedReason: reason,
    },
  });
}
