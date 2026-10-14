import { unstable_cache } from "next/cache";
import { redirect } from "next/navigation";

import { ForbiddenError, UnauthenticatedError } from "@/lib/api/errors";
import { rotateSessionIfStale } from "@/lib/auth/rotation";
import { getSession, type ActiveSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";

export type StaffRole = "MENTOR" | "ADMIN" | "SUPER_ADMIN";
const STAFF_ROLES: readonly string[] = ["MENTOR", "ADMIN", "SUPER_ADMIN"];

/**
 * Permission catalogue for a set of roles. The matrix only changes when an admin's role
 * is changed - and that action revokes every one of their sessions and invalidates this
 * cache through the "role-permissions" tag - so the lookup is cached for two minutes
 * instead of running a role-permission query on every page render (one more database
 * round trip per request).
 */
const cachedRolePermissions = unstable_cache(
  async (roleKeys: string[]) => {
    const rows = await getPrisma().rolePermission.findMany({
      where: { role: { key: { in: roleKeys as never[] } } },
      select: { permission: { select: { key: true } } },
    });
    return rows.map((row) => row.permission.key);
  },
  ["role-permissions"],
  { revalidate: 120, tags: ["role-permissions"] },
);

export interface StudentContext {
  userId: string;
  email: string;
  name: string | null;
  sessionId: string;
}

export interface StaffContext {
  userId: string;
  email: string;
  name: string | null;
  sessionId: string;
  roles: string[];
  permissions: ReadonlySet<string>;
  isSuperAdmin: boolean;
  /** Highest role, used for audit records. */
  primaryRole: StaffRole;
}

function toStudent(session: ActiveSession): StudentContext {
  return { userId: session.user.id, email: session.user.email, name: session.user.name, sessionId: session.id };
}

/** For route handlers and server actions: throws a typed error instead of redirecting. */
export async function requireStudent(): Promise<StudentContext> {
  const session = await getSession("STUDENT");
  if (!session) throw new UnauthenticatedError();
  if (!session.user.roles.some((r) => r.role.key === "STUDENT")) throw new ForbiddenError();
  await rotateSessionIfStale({ id: session.id, userId: session.userId, kind: "STUDENT" });
  return toStudent(session);
}

export async function loadStaffContext(session: ActiveSession): Promise<StaffContext | null> {
  const roles = session.user.roles.map((r) => r.role.key).filter((key) => STAFF_ROLES.includes(key));
  if (roles.length === 0) return null;
  const isSuperAdmin = roles.includes("SUPER_ADMIN");
  const permissionKeys = await cachedRolePermissions(roles);
  const primaryRole: StaffRole = isSuperAdmin ? "SUPER_ADMIN" : roles.includes("ADMIN") ? "ADMIN" : "MENTOR";
  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    sessionId: session.id,
    roles,
    permissions: new Set(permissionKeys),
    isSuperAdmin,
    primaryRole,
  };
}

export function can(staff: StaffContext, permission: string): boolean {
  return staff.isSuperAdmin || staff.permissions.has(permission);
}

/**
 * Authorisation is always enforced here, on the server. Hiding a button in the UI is
 * only cosmetic; every admin action calls this with the permission it needs.
 */
export async function requireStaff(permission?: string): Promise<StaffContext> {
  const session = await getSession("ADMIN");
  if (!session) throw new UnauthenticatedError();
  const staff = await loadStaffContext(session);
  if (!staff) throw new ForbiddenError();
  if (permission && !can(staff, permission)) throw new ForbiddenError();
  await rotateSessionIfStale({ id: session.id, userId: session.userId, kind: "ADMIN" });
  return staff;
}

/** For server components: redirects instead of throwing. */
export async function requireStudentPage(): Promise<StudentContext> {
  const session = await getSession("STUDENT");
  if (!session || !session.user.roles.some((r) => r.role.key === "STUDENT")) redirect("/login");
  return toStudent(session);
}

export async function requireStaffPage(permission?: string): Promise<StaffContext> {
  const session = await getSession("ADMIN");
  if (!session) redirect("/admin/login");
  const staff = await loadStaffContext(session);
  if (!staff) redirect("/admin/login");
  if (permission && !can(staff, permission)) redirect("/403");
  return staff;
}

export function actorOf(staff: StaffContext, meta?: { ipAddress?: string; userAgent?: string }) {
  return { userId: staff.userId, role: staff.primaryRole, ...meta };
}
