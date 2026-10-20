import type { ReactNode } from "react";

import { DashboardShell } from "@/components/dashboard/shell";
import { requireStudentPage } from "@/lib/auth/guards";
import { getBranding } from "@/lib/config/branding";
import { STUDENT_NAV } from "@/lib/config/constants";
import { unreadCount } from "@/server/services/notifications";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** Unread badge, computed per request (a student's unread count only changes when
 * notifications are read or created, both of which revalidate the page). Not wrapped
 * in unstable_cache because its static keyParts cannot include the per-request userId,
 * which would return one student's count to another student. */
export default async function StudentLayout({ children }: { children: ReactNode }) {
  const student = await requireStudentPage();
  const unread = await unreadCount(student.userId);
  const nav = STUDENT_NAV.map((item) => ({ ...item, badge: item.key === "notifications" ? unread : undefined }));
  return (
    <DashboardShell nav={nav} title="Student portal" user={student.name ?? student.email} logoutHref="/login" brand={getBranding().companyName}>
      {children}
    </DashboardShell>
  );
}
