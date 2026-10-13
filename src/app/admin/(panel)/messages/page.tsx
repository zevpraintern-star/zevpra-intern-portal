import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { SelectField } from "@/components/forms/fields";
import { EmptyState, PageHeader } from "@/components/dashboard/primitives";
import { Pagination, parsePaging } from "@/components/dashboard/pagination";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireStaffPage } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { formatDateTime } from "@/lib/utils/format";
import { updateContactAction } from "@/app/admin/actions";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaffPage("messages.manage");
  const { page, size, skip } = parsePaging(await searchParams);
  const [rows, total] = await Promise.all([getPrisma().contactMessage.findMany({ orderBy: { createdAt: "desc" }, skip, take: size }), getPrisma().contactMessage.count()]);
  return (
    <>
      <PageHeader title="Messages" description={`${total} from the contact form`} />
      {rows.length === 0 ? <EmptyState title="No messages yet" /> : <div className="space-y-3">{rows.map((m) => (
        <Card key={m.id}><CardContent className="grid gap-4 pt-6 md:grid-cols-[1fr_auto]">
          <div className="text-sm"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{m.subject}</p><StatusBadge value={m.status} /></div>
            <p className="text-muted-foreground">{m.name} · <a className="text-primary hover:underline" href={`mailto:${m.email}`}>{m.email}</a> · {formatDateTime(m.createdAt)}</p>
            <p className="mt-2 whitespace-pre-wrap">{m.message}</p></div>
          <ActionForm action={updateContactAction} className="w-44 space-y-2"><input type="hidden" name="id" value={m.id} /><SelectField label="Status" name="status" defaultValue={m.status} options={["NEW", "IN_REVIEW", "RESOLVED", "SPAM"].map((s) => ({ value: s, label: s.replace("_", " ").toLowerCase() }))} /><SubmitButton size="sm" variant="outline">Update</SubmitButton></ActionForm>
        </CardContent></Card>))}</div>}
      <Pagination base="/admin/messages" params={{}} page={page} size={size} total={total} />
    </>
  );
}
