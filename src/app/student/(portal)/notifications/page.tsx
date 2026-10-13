import { EmptyState, PageHeader } from "@/components/dashboard/primitives";
import { SubmitButton } from "@/components/forms/action-form";
import { Card, CardContent } from "@/components/ui/card";
import { requireStudentPage } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { formatDateTime } from "@/lib/utils/format";
import Link from "next/link";
import { markNotificationAction } from "@/app/student/actions";

export default async function NotificationsPage() {
  const student = await requireStudentPage();
  const items = await getPrisma().notification.findMany({ where: { userId: student.userId }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <>
      <PageHeader title="Notifications" actions={items.some((n) => !n.readAt) ? <form action={markNotificationAction}><SubmitButton variant="outline" size="sm">Mark all as read</SubmitButton></form> : undefined} />
      {items.length === 0 ? <EmptyState title="You're all caught up" /> : <div className="space-y-2">{items.map((n) => (
        <Card key={n.id} className={n.readAt ? "opacity-70" : "border-primary/40"}><CardContent className="flex items-start justify-between gap-4 pt-6">
          <div><p className="font-medium">{n.title}</p><p className="text-sm text-muted-foreground">{n.body}</p><p className="mt-1 text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</p>
            {n.link ? <Link href={n.link} className="mt-1 inline-block text-sm text-primary hover:underline">Open</Link> : null}</div>
          {!n.readAt ? <form action={markNotificationAction}><input type="hidden" name="id" value={n.id} /><SubmitButton variant="ghost" size="sm">Mark read</SubmitButton></form> : null}
        </CardContent></Card>))}</div>}
    </>
  );
}
