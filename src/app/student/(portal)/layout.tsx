import { unstable_cache } from "next/cache";
import type { ReactNode } from "react";

import { DashboardShell } from "@/components/dashboard/shell";
import { requireStudentPage } from "@/lib/auth/guards";
import { getBranding } from "@/lib/config/branding";
import { STUDENT_NAV } from "@/lib/config/constants";
import { unreadCount } from "@/server/services/notifications";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** Unread badge, cached 30s per student; the notifications page always shows the truth. */
const getUnreadCount = unstable_cache(
  async (userId: string) => unreadCount(userId),
  ["student-unread-count"],
  { revalidate: 30 },
);

export default async function StudentLayout({ children }: { children: ReactNode }) {
  const student = await requireStudentPage();
  const unread = await getUnreadCount(student.userId);
  const nav = STUDENT_NAV.map((item) => ({ ...item, badge: item.key === "notifications" ? unread : undefined }));
  return (
    <DashboardShell nav={nav} title="Student portal" user={student.name ?? student.email} logoutHref="/login" brand={getBranding().companyName}>
      {children}
    </DashboardShell>
  );
}
