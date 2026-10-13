import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { SelectField, TextField } from "@/components/forms/fields";
import { PageHeader, Table, Td, Th } from "@/components/dashboard/primitives";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStaffPage } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { formatDateTime } from "@/lib/utils/format";
import { changeStaffRoleAction, createStaffAction, setStaffStatusAction } from "@/app/admin/actions";

const ROLES = [{ value: "MENTOR", label: "Mentor" }, { value: "ADMIN", label: "Administrator" }, { value: "SUPER_ADMIN", label: "Super administrator" }];

export default async function AdminsPage() {
  const me = await requireStaffPage("admins.manage");
  const staff = await getPrisma().user.findMany({ where: { roles: { some: { role: { key: { in: ["MENTOR", "ADMIN", "SUPER_ADMIN"] } } } } }, orderBy: { createdAt: "asc" }, include: { roles: { include: { role: true } } } });
  return (
    <>
      <PageHeader title="Administrators" description="Staff sign in with a password and an emailed code." />
      <Table label="Staff"><thead><tr><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Status</Th><Th>Last sign-in</Th><Th>Manage</Th></tr></thead><tbody>
        {staff.map((u) => { const role = u.roles.find((r) => ["MENTOR", "ADMIN", "SUPER_ADMIN"].includes(r.role.key))?.role.key ?? "ADMIN"; const self = u.id === me.userId; return (
          <tr key={u.id}><Td className="font-medium">{u.name}{self ? " (you)" : ""}</Td><Td>{u.email}</Td><Td>{role.replace("_", " ").toLowerCase()}</Td><Td><StatusBadge value={u.status} /></Td><Td>{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "-"}</Td>
            <Td>{self ? <span className="text-muted-foreground">-</span> : (<div className="flex flex-wrap gap-2">
              <ActionForm action={changeStaffRoleAction} className="flex items-end gap-2 space-y-0"><input type="hidden" name="userId" value={u.id} /><select name="role" defaultValue={role} aria-label={`Role for ${u.email}`} className="h-9 rounded-md border border-input bg-background px-2 text-sm">{ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select><SubmitButton size="sm" variant="outline">Set role</SubmitButton></ActionForm>
              <ActionForm action={setStaffStatusAction} className="space-y-0"><input type="hidden" name="userId" value={u.id} /><input type="hidden" name="status" value={u.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"} /><SubmitButton size="sm" variant={u.status === "ACTIVE" ? "destructive" : "default"}>{u.status === "ACTIVE" ? "Suspend" : "Reactivate"}</SubmitButton></ActionForm></div>)}</Td></tr>); })}</tbody></Table>
      <Card className="mt-8 max-w-xl"><CardHeader><CardTitle>Add a staff member</CardTitle></CardHeader><CardContent>
        <ActionForm action={createStaffAction} resetOnSuccess><TextField label="Name" name="name" required /><TextField label="Email" name="email" type="email" required /><SelectField label="Role" name="role" options={ROLES} defaultValue="MENTOR" /><TextField label="Initial password" name="password" type="password" autoComplete="new-password" hint="12+ characters with upper-case, lower-case and a number. Share it through a secure channel." required /><SubmitButton>Create account</SubmitButton></ActionForm></CardContent></Card>
    </>
  );
}
