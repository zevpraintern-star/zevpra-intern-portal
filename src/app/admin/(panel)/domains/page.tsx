import Link from "next/link";

import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { CheckField, SelectField, TextArea, TextField } from "@/components/forms/fields";
import { PageHeader, Table, Td, Th } from "@/components/dashboard/primitives";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStaffPage } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { deleteDomainAction, saveCategoryAction, saveDomainAction } from "@/app/admin/actions";

export default async function DomainsAdmin({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireStaffPage("domains.manage");
  const { edit } = await searchParams;
  const [cats, domains] = await Promise.all([
    getPrisma().domainCategory.findMany({ orderBy: { sortOrder: "asc" } }),
    getPrisma().domain.findMany({ orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }], include: { category: { select: { name: true } }, _count: { select: { programs: true } } } }),
  ]);
  const d = edit ? domains.find((x) => x.id === edit) : undefined;
  return (
    <>
      <PageHeader title="Domains" description="Changes appear on the public site within an hour, with no deploy." />
      <Table label="Domains"><thead><tr><Th>Domain</Th><Th>Category</Th><Th>Status</Th><Th>Internships</Th><Th /></tr></thead><tbody>
        {domains.map((x) => (<tr key={x.id}><Td className="font-medium">{x.name}</Td><Td>{x.category.name}</Td><Td><StatusBadge value={x.isActive ? "ACTIVE" : "ARCHIVED"} /></Td><Td>{x._count.programs}</Td>
          <Td className="space-x-3 whitespace-nowrap"><Link className="text-primary hover:underline" href={`?edit=${x.id}#form`}>Edit</Link>
            <details className="inline"><summary className="inline cursor-pointer text-destructive">Delete</summary><ActionForm action={deleteDomainAction} className="mt-2"><input type="hidden" name="id" value={x.id} /><SubmitButton variant="destructive" size="sm">Confirm</SubmitButton></ActionForm></details></Td></tr>))}</tbody></Table>
      <div className="mt-8 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card id="form"><CardHeader><CardTitle>{d ? `Edit: ${d.name}` : "New domain"}</CardTitle></CardHeader><CardContent>
          <ActionForm action={saveDomainAction} className="grid gap-5 sm:grid-cols-2" key={d?.id ?? "new"}>
            {d ? <input type="hidden" name="id" value={d.id} /> : null}
            <TextField label="Name" name="name" defaultValue={d?.name} required />
            <SelectField label="Category" name="categoryId" defaultValue={d?.categoryId} options={cats.map((c) => ({ value: c.id, label: c.name }))} />
            <TextField label="Short description" name="shortDescription" defaultValue={d?.shortDescription ?? ""} className="sm:col-span-2" />
            <TextArea label="Description" name="description" defaultValue={d?.description ?? ""} rows={3} className="sm:col-span-2" />
            <TextField label="Order" name="sortOrder" type="number" min={0} defaultValue={d?.sortOrder ?? 0} />
            <TextField label="Icon name (optional)" name="iconName" defaultValue={d?.iconName ?? ""} />
            <CheckField name="isFeatured" label="Featured" defaultChecked={d?.isFeatured} />
            {d ? <CheckField name="isActive" label="Active (visible publicly)" defaultChecked={d.isActive} /> : null}
            <div className="sm:col-span-2"><SubmitButton>{d ? "Save changes" : "Create domain"}</SubmitButton></div>
          </ActionForm></CardContent></Card>
        <Card><CardHeader><CardTitle>New category</CardTitle></CardHeader><CardContent>
          <ActionForm action={saveCategoryAction} resetOnSuccess><TextField label="Name" name="name" required /><TextArea label="Description" name="description" rows={2} /><SubmitButton>Add category</SubmitButton></ActionForm></CardContent></Card>
      </div>
    </>
  );
}
