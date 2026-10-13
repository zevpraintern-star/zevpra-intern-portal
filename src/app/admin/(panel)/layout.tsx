import type { ReactNode } from "react";

import { DashboardShell } from "@/components/dashboard/shell";
import { can, requireStaffPage } from "@/lib/auth/guards";
import { getBranding } from "@/lib/config/branding";
import { ADMIN_NAV } from "@/lib/config/admin-nav";
import { getPrisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const staff = await requireStaffPage();
  const [apps, payments, subs] = await Promise.all([
    can(staff, "applications.review") ? getPrisma().application.count({ where: { status: "PENDING" } }) : 0,
    can(staff, "payments.view") ? getPrisma().paymentRequest.count({ where: { status: "UNDER_REVIEW" } }) : 0,
    can(staff, "tasks.review") ? Promise.all([getPrisma().taskSubmission.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }), getPrisma().projectSubmission.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } })]).then(([a, b]) => a + b) : 0,
  ]);
  const badges: Record<string, number> = { applications: apps, payments, submissions: subs };
  const nav = ADMIN_NAV.filter((n) => !n.permission || can(staff, n.permission)).map((n) => ({ key: n.key, label: n.label, href: n.href, badge: badges[n.key] || undefined }));
  return (
    <DashboardShell nav={nav} title={staff.primaryRole.replace("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())} user={staff.name ?? staff.email} logoutHref="/admin/login" brand={getBranding().companyName}>
      {children}
    </DashboardShell>
  );
}
