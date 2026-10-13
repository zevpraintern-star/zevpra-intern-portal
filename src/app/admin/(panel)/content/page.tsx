import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { CheckField, TextArea, TextField } from "@/components/forms/fields";
import { PageHeader } from "@/components/dashboard/primitives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStaffPage } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { deleteFaqAction, saveFaqAction, saveHomepageSectionAction } from "@/app/admin/actions";

export default async function ContentAdmin() {
  await requireStaffPage("content.manage");
  const [faqs, sections] = await Promise.all([
    getPrisma().faq.findMany({ orderBy: [{ category: "asc" }, { sortOrder: "asc" }] }),
    getPrisma().homepageSection.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Content" description="FAQs and homepage text. Plain text only: it is escaped when shown." />
      <h2 className="mb-3 font-display text-lg font-semibold">FAQs</h2>
      <div className="space-y-3">
        {faqs.map((f) => (
          <Card key={f.id}><CardContent className="pt-6"><details><summary className="cursor-pointer font-medium">{f.question}{!f.isPublished ? " (hidden)" : ""}</summary>
            <ActionForm action={saveFaqAction} className="mt-4"><input type="hidden" name="id" value={f.id} /><TextField label="Question" name="question" defaultValue={f.question} /><TextArea label="Answer" name="answer" defaultValue={f.answer} rows={3} /><div className="grid grid-cols-2 gap-4"><TextField label="Category" name="category" defaultValue={f.category} /><TextField label="Order" name="sortOrder" type="number" defaultValue={f.sortOrder} /></div><CheckField name="isPublished" label="Published" defaultChecked={f.isPublished} /><SubmitButton>Save</SubmitButton></ActionForm>
            <ActionForm action={deleteFaqAction} className="mt-2"><input type="hidden" name="id" value={f.id} /><SubmitButton variant="destructive" size="sm">Delete</SubmitButton></ActionForm></details></CardContent></Card>))}
        <Card><CardHeader><CardTitle>Add FAQ</CardTitle></CardHeader><CardContent><ActionForm action={saveFaqAction} resetOnSuccess><TextField label="Question" name="question" required /><TextArea label="Answer" name="answer" rows={3} required /><TextField label="Category" name="category" defaultValue="general" /><SubmitButton>Add FAQ</SubmitButton></ActionForm></CardContent></Card>
      </div>
      <h2 className="mb-3 mt-10 font-display text-lg font-semibold">Homepage sections</h2>
      <div className="space-y-3">{sections.map((s) => (
        <Card key={s.id}><CardContent className="pt-6"><details><summary className="cursor-pointer font-medium">{s.key}{!s.isEnabled ? " (off)" : ""}</summary>
          <ActionForm action={saveHomepageSectionAction} className="mt-4"><input type="hidden" name="id" value={s.id} /><TextField label="Title" name="title" defaultValue={s.title ?? ""} /><TextField label="Subtitle" name="subtitle" defaultValue={s.subtitle ?? ""} /><CheckField name="isEnabled" label="Enabled" defaultChecked={s.isEnabled} /><SubmitButton>Save</SubmitButton></ActionForm></details></CardContent></Card>))}</div>
    </>
  );
}
