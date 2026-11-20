import Link from "next/link";

import { BarList, ColumnChart, PageHeader, Stat } from "@/components/dashboard/primitives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { can, requireStaffPage } from "@/lib/auth/guards";
import { dashboardMetrics } from "@/server/services/admin";

export default async function AdminDashboard() {
  const staff = await requireStaffPage();
  const m = await dashboardMetrics();
  const t = m.totals;
  const quota = m.totals.emailQuota ?? { sent: 0, limit: 300 };
  const quotaPct = quota.limit > 0 ? Math.round((quota.sent / quota.limit) * 100) : 0;
  const quotaNearLimit = quotaPct >= 80;
  const link = (label: string, value: number, href: string, perm: string) => (can(staff, perm) ? <Link href={href} className="block rounded-xl outline-offset-2 transition-shadow hover:shadow-md"><Stat label={label} value={value} /></Link> : <Stat label={label} value={value} />);
  return (
    <>
      <PageHeader title="Dashboard" description="Aggregate numbers only: open a section to see individual records." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {link("Total students", t.totalStudents, "/admin/students", "students.view")}
        {link("Pending applications", t.pendingApplications, "/admin/applications", "applications.review")}
        {link("Active internships", t.activeInternships, "/admin/enrollments?status=IN_PROGRESS", "students.view")}
        {link("Completed internships", t.completedInternships, "/admin/enrollments?status=COMPLETED", "students.view")}
        {link("Pending submissions", t.pendingTaskSubmissions + t.pendingProjectReviews, "/admin/submissions", "tasks.review")}
        {link("Certificates awaiting release", t.certificatesToPrepare, "/admin/certificates", "certificates.issue")}
        {link("Issued certificates", t.issuedCertificates, "/admin/certificates", "certificates.issue")}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Registrations, last 30 days</CardTitle></CardHeader><CardContent><ColumnChart data={m.registrations} label="Registrations per day" /></CardContent></Card>
        <Card><CardHeader><CardTitle>Applications by domain</CardTitle></CardHeader><CardContent><BarList data={m.byDomain} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Internship completion</CardTitle></CardHeader><CardContent><BarList data={m.completion} /></CardContent></Card>
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader><CardTitle>Emails sent today</CardTitle></CardHeader>
          <CardContent>
            <p className={quotaNearLimit ? "text-2xl font-semibold text-red-600" : "text-2xl font-semibold"}>
              {quota.sent} / {quota.limit}
              {quotaNearLimit ? ` (${quotaPct}% — approaching the daily limit)` : ` (${quotaPct}%)`}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">Brevo free-tier daily quota. Operational emails are suppressed in essential-only mode.</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
