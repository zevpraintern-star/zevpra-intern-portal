import type { SessionKind } from "@/generated/prisma/enums";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";

/** A stolen token is only useful until the next rotation. Admin sessions rotate far more often. */
export const ROTATE_AFTER_MS: Record<SessionKind, number> = {
  STUDENT: 24 * 60 * 60 * 1000,
  ADMIN: 30 * 60 * 1000,
};
const OVERLAP_MS = 60_000;

/**
 * Issues a new session token (linked via rotatedFromId) once the current one is old.
 *
 * Cookies can only be written in route handlers and server actions, so this is called
 * from requireStudent/requireStaff and silently does nothing during a page render; the
 * next mutation rotates instead. The old token stays valid for a short overlap so
 * requests already in flight with the old cookie do not fail.
 */
export async function rotateSessionIfStale(current: { id: string; userId: string; kind: SessionKind }): Promise<boolean> {
  const prisma = getPrisma();
  const row = await prisma.session.findUnique({ where: { id: current.id }, select: { createdAt: true, ipAddress: true, userAgent: true, expiresAt: true } });
  if (!row || Date.now() - row.createdAt.getTime() < ROTATE_AFTER_MS[current.kind]) return false;

  let freshId: string | null = null;
  try {
    const { token, session } = await createSession({ userId: current.userId, kind: current.kind, ipAddress: row.ipAddress ?? undefined, userAgent: row.userAgent ?? undefined });
    freshId = session.id as string;
    await setSessionCookie(token, current.kind);
    await prisma.session.update({ where: { id: freshId }, data: { rotatedFromId: current.id } });
    await prisma.session.update({
      where: { id: current.id },
      data: { expiresAt: new Date(Math.min(row.expiresAt.getTime(), Date.now() + OVERLAP_MS)), revokedReason: "rotated" },
    });
    return true;
  } catch {
    if (freshId) await prisma.session.delete({ where: { id: freshId } }).catch(() => undefined);
    return false;
  }
}
