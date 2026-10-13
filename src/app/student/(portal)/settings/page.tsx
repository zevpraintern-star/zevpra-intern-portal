import { PageHeader, DefinitionList } from "@/components/dashboard/primitives";
import { SubmitButton } from "@/components/forms/action-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { requireStudentPage } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { formatDateTime } from "@/lib/utils/format";
import { signOutEverywhereAction } from "@/app/student/actions";

export default async function SettingsPage() {
  const student = await requireStudentPage();
  const [user, sessions] = await Promise.all([
    getPrisma().user.findUniqueOrThrow({ where: { id: student.userId }, select: { email: true, createdAt: true, lastLoginAt: true } }),
    getPrisma().session.count({ where: { userId: student.userId, kind: "STUDENT", revokedAt: null, expiresAt: { gt: new Date() } } }),
  ]);
  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-6">
        <Card><CardHeader><CardTitle>Account</CardTitle></CardHeader><CardContent><DefinitionList items={[["Email", user.email], ["Member since", formatDateTime(user.createdAt)], ["Last sign-in", user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "-"]]} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Security</CardTitle><CardDescription>You have {sessions} active session{sessions === 1 ? "" : "s"}. Sign-in uses a one-time code sent to your email, so there is no password to manage.</CardDescription></CardHeader>
          <CardContent><form action={signOutEverywhereAction}><SubmitButton variant="outline">Sign out of all devices</SubmitButton></form></CardContent></Card>
      </div>
    </>
  );
}
