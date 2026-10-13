import { EmptyState, PageHeader } from "@/components/dashboard/primitives";
import { Card, CardContent } from "@/components/ui/card";
import { requireStudentPage } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { formatDate } from "@/lib/utils/format";

export default async function AnnouncementsPage() {
  const student = await requireStudentPage();
  const mine = await getPrisma().application.findMany({ where: { studentId: student.userId, status: "APPROVED" }, select: { programId: true, domainId: true } });
  const now = new Date();
  const items = await getPrisma().announcement.findMany({
    where: { isPublished: true, AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, { OR: [{ audience: "ALL" }, { programId: { in: mine.map((m) => m.programId) } }, { domainId: { in: mine.map((m) => m.domainId) } }] }] },
    orderBy: { publishedAt: "desc" }, take: 50,
  });
  return (
    <>
      <PageHeader title="Announcements" />
      {items.length === 0 ? <EmptyState title="No announcements" /> : <div className="space-y-3">{items.map((a) => (<Card key={a.id}><CardContent className="pt-6"><p className="font-medium">{a.title}</p><p className="text-xs text-muted-foreground">{formatDate(a.publishedAt)}</p><p className="mt-2 whitespace-pre-wrap text-sm">{a.body}</p></CardContent></Card>))}</div>}
    </>
  );
}
