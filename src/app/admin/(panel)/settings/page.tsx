import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { CheckField, TextArea } from "@/components/forms/fields";
import { PageHeader } from "@/components/dashboard/primitives";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStaffPage } from "@/lib/auth/guards";
import { getSetting, isAutoApproveEnabled, isHardTierEnabled } from "@/server/services/settings";
import { savePlatformSettingsAction } from "@/app/admin/actions";

export default async function SettingsAdmin() {
  await requireStaffPage("settings.manage");
  const [auto, hardTier, disclaimer] = await Promise.all([
    isAutoApproveEnabled(),
    isHardTierEnabled(),
    getSetting<string>("certificate_disclaimer", ""),
  ]);

  return (
    <>
      <PageHeader title="Settings" description="Manage internship review and certificate wording." />
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Platform settings</CardTitle>
          <CardDescription>Certificate issuance is free and starts after a final project is approved.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={savePlatformSettingsAction}>
            <TextArea label="Certificate disclaimer (printed on every certificate)" name="certificateDisclaimer" defaultValue={disclaimer} rows={3} hint="Do not claim government, UGC, AICTE or university approval unless you hold it." />
            <div className="grid gap-4 sm:grid-cols-2">
              <CheckField name="autoApprove" label="Auto-approve applications" hint="Off by default: an administrator approves each student before they receive tasks." defaultChecked={auto} />
              <CheckField name="hardTier" label="Enable hard-tier certificates and hard-tier review checklist" defaultChecked={hardTier} />
            </div>
            <SubmitButton>Save settings</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </>
  );
}
