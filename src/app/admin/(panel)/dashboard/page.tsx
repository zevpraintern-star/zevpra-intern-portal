import Link from "next/link";

import { BarList, ColumnChart, PageHeader, Stat } from "@/components/dashboard/primitives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { can, requireStaffPage } from "@/lib/auth/guards";
import { dashboardMetrics } from "@/server/services/admin";

export default async function AdminDashboard() {
  const staff = await requireStaffPage();
  const m = await dashboardMetrics();
  const t = m.totals;
  const link = (label: string, value: number, href: string, perm: string) => (can(staff, perm) ? <Link href={href} className="block rounded-xl outline-offset-2 transition-shadow hover:shadow-md"><Stat label={label} value={value} /></Link> : <Stat label={label} value={value} />);
  return (
    <>
      <PageHeader title="Dashboard" description="Aggregate numbers only: open a section to see individual records." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total students" value={t.totalStudents} hint={`${t.new7} new in 7 days · ${t.new30} in 30 days`} />
        {link("Pending applications", t.pendingApplications, "/admin/applications", "applications.review")}
        <Stat label="Active internships" value={t.activeInternships} />
        <Stat label="Completed internships" value={t.completedInternships} />
        {link("Pending submissions", t.pendingTaskSubmissions + t.pendingProjectReviews, "/admin/submissions", "tasks.review")}
        <Stat label="Certificate-eligible, unpaid" value={t.eligibleNoCert} />
        {link("Payments to verify", t.paymentsUnderReview, "/admin/payments", "payments.view")}
        {link("Issued certificates", t.issuedCertificates, "/admin/certificates", "certificates.issue")}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Registrations, last 30 days</CardTitle></CardHeader><CardContent><ColumnChart data={m.registrations} label="Registrations per day" /></CardContent></Card>
        <Card><CardHeader><CardTitle>Applications by domain</CardTitle></CardHeader><CardContent><BarList data={m.byDomain} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Internship completion</CardTitle></CardHeader><CardContent><BarList data={m.completion} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Certificate payments</CardTitle></CardHeader><CardContent><BarList data={m.payments} empty="No payment requests yet" /></CardContent></Card>
      </div>
    </>
  );
}
