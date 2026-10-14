import { unstable_cache } from "next/cache";
import type { ReactNode } from "react";

import { DashboardShell } from "@/components/dashboard/shell";
import { can, requireStaffPage } from "@/lib/auth/guards";
import { getBranding } from "@/lib/config/branding";
import { ADMIN_NAV } from "@/lib/config/admin-nav";
import { getPrisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/**
 * Sidebar badge counts. The totals are identical for every staff member and only change
 * when work is reviewed, so they are cached for 60 seconds instead of re-running four
 * aggregate queries on every single page navigation (each query pays a database round
 * trip). Permission gating still happens per user, below, so nobody sees more than their
 * role allows. The cache self-heals within 60 seconds of any change.
 */
const getBadgeCounts = unstable_cache(
  async () => {
    const prisma = getPrisma();
    const [applications, payments, taskSubmissions, projectSubmissions] = await Promise.all([
      prisma.application.count({ where: { status: "PENDING" } }),
      prisma.paymentRequest.count({ where: { status: "UNDER_REVIEW" } }),
      prisma.taskSubmission.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }),
      prisma.projectSubmission.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }),
    ]);
    return { applications, payments, submissions: taskSubmissions + projectSubmissions };
  },
  ["admin-badge-counts"],
  { revalidate: 60, tags: ["admin-badge-counts"] },
);

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const staff = await requireStaffPage();
  const counts = await getBadgeCounts();
  const badges: Record<string, number> = {
    applications: can(staff, "applications.review") ? counts.applications : 0,
    payments: can(staff, "payments.view") ? counts.payments : 0,
    submissions: can(staff, "tasks.review") ? counts.submissions : 0,
  };
  const nav = ADMIN_NAV.filter((n) => !n.permission || can(staff, n.permission)).map((n) => ({ key: n.key, label: n.label, href: n.href, badge: badges[n.key] || undefined }));
  return (
    <DashboardShell nav={nav} title={staff.primaryRole.replace("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())} user={staff.name ?? staff.email} logoutHref="/admin/login" brand={getBranding().companyName}>
      {children}
    </DashboardShell>
  );
}
