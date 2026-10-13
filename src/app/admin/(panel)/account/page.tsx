import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { TextField } from "@/components/forms/fields";
import { DefinitionList, PageHeader } from "@/components/dashboard/primitives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStaffPage } from "@/lib/auth/guards";
import { changeOwnPasswordAction } from "@/app/admin/actions";

export default async function AccountPage() {
  const staff = await requireStaffPage();
  return (
    <>
      <PageHeader title="My account" />
      <div className="max-w-xl space-y-6">
        <Card><CardContent className="pt-6"><DefinitionList items={[["Name", staff.name], ["Email", staff.email], ["Role", staff.primaryRole.replace("_", " ").toLowerCase()], ["Permissions", `${staff.isSuperAdmin ? "all" : staff.permissions.size}`]]} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Change password</CardTitle></CardHeader><CardContent>
          <ActionForm action={changeOwnPasswordAction} resetOnSuccess><TextField label="Current password" name="currentPassword" type="password" autoComplete="current-password" required /><TextField label="New password" name="newPassword" type="password" autoComplete="new-password" hint="12+ characters with upper-case, lower-case and a number." required /><SubmitButton>Change password</SubmitButton></ActionForm></CardContent></Card>
      </div>
    </>
  );
}
