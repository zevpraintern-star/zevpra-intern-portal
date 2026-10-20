import Image from "next/image";

import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { CheckField, SelectField, TextArea, TextField } from "@/components/forms/fields";
import { FileField } from "@/components/forms/file-field";
import { PageHeader } from "@/components/dashboard/primitives";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStaffPage } from "@/lib/auth/guards";
import { getSetting, getPaymentSettings, isAutoApproveEnabled, isHardTierEnabled } from "@/server/services/settings";
import { savePaymentSettingsAction } from "@/app/admin/actions";

export default async function SettingsAdmin() {
  await requireStaffPage("settings.manage");
  const [pay, auto, disclaimer] = await Promise.all([getPaymentSettings(), isAutoApproveEnabled(), getSetting<string>("certificate_disclaimer", "")]);
  return (
    <>
      <PageHeader title="Settings" description="Payment details are never hardcoded: students always see what you set here." />
      <Card className="max-w-2xl"><CardHeader><CardTitle>Certificate payment and applications</CardTitle><CardDescription>Only super administrators can change these. Every change is audited.</CardDescription></CardHeader><CardContent>
        <ActionForm action={savePaymentSettingsAction}>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField label="Certificate fee" name="certificateFee" type="number" min={1} step="1" defaultValue={pay.fee} required />
            <TextField label="Currency" name="currency" defaultValue={pay.currency} maxLength={3} />
            <TextField label="UPI ID" name="upiId" defaultValue={pay.upiId} placeholder="name@bank" />
            <TextField label="Payee name" name="upiPayeeName" defaultValue={pay.payeeName} />
          </div>
          <div><p className="mb-2 text-sm font-medium">UPI QR code</p>{pay.qrFileId ? <Image src="/api/payment/qr" alt="Current UPI QR code" width={160} height={160} unoptimized className="mb-3 rounded-lg border border-border bg-white p-2" /> : <p className="mb-2 text-sm text-muted-foreground">None uploaded yet.</p>}
            <FileField label="Upload a new QR image" name="upiQrFileId" purpose="PAYMENT_QR" accept="image/png,image/jpeg,image/webp" hint="Stored privately; shown only to certificate-eligible students." /></div>
          <TextArea label="Extra payment instructions (optional)" name="instructions" defaultValue={pay.instructions} rows={3} />
          <TextArea label="Certificate disclaimer (printed on every certificate)" name="certificateDisclaimer" defaultValue={disclaimer} rows={3} hint="Do not claim government, UGC, AICTE or university approval unless you hold it." />
          <div className="grid gap-4 sm:grid-cols-2">
            <CheckField name="autoApprove" label="Auto-approve applications" hint="Off by default: an administrator approves each student before they receive tasks." defaultChecked={auto} />
            <CheckField name="hardTier" label="Enable hard-tier certificates and hard-tier review checklist" hint="When off, the Hard tier is disabled for projects, templates and the reviewer checklist." />
          </div>
          <SubmitButton>Save settings</SubmitButton>
        </ActionForm></CardContent></Card>
    </>
  );
}
