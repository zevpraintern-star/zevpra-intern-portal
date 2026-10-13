import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { CheckField, SelectField, TextArea, TextField } from "@/components/forms/fields";
import { PageHeader, Table, Td, Th } from "@/components/dashboard/primitives";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStaffPage } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { formatDate } from "@/lib/utils/format";
import { deleteAnnouncementAction, saveAnnouncementAction } from "@/app/admin/actions";

export default async function AnnouncementsAdmin() {
  await requireStaffPage("announcements.manage");
  const [items, programs] = await Promise.all([
    getPrisma().announcement.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { program: { select: { title: true } } } }),
    getPrisma().internshipProgram.findMany({ orderBy: { title: "asc" }, select: { id: true, title: true } }),
  ]);
  return (
    <>
      <PageHeader title="Announcements" description="Shown to students on their Announcements page." />
      <Card><CardHeader><CardTitle>New announcement</CardTitle></CardHeader><CardContent><ActionForm action={saveAnnouncementAction} resetOnSuccess>
        <TextField label="Title" name="title" required /><TextArea label="Message" name="body" rows={4} required />
        <SelectField label="Audience" name="programId" options={[{ value: "", label: "All students" }, ...programs.map((p) => ({ value: p.id, label: p.title }))]} />
        <CheckField name="isPublished" label="Publish now" defaultChecked /><SubmitButton>Save</SubmitButton></ActionForm></CardContent></Card>
      <div className="mt-8"><Table label="Announcements"><thead><tr><Th>Title</Th><Th>Audience</Th><Th>Status</Th><Th>Created</Th><Th /></tr></thead><tbody>
        {items.map((a) => (<tr key={a.id}><Td className="font-medium">{a.title}</Td><Td>{a.program?.title ?? "Everyone"}</Td><Td><StatusBadge value={a.isPublished ? "PUBLISHED" : "DRAFT"} /></Td><Td>{formatDate(a.createdAt)}</Td><Td><ActionForm action={deleteAnnouncementAction} className="space-y-0"><input type="hidden" name="id" value={a.id} /><SubmitButton variant="ghost" size="sm">Delete</SubmitButton></ActionForm></Td></tr>))}</tbody></Table></div>
    </>
  );
}
