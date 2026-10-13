import { Flash } from "@/components/dashboard/flash";
import { Lock } from "lucide-react";
import Image from "next/image";

import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { CheckField, TextField, TextArea } from "@/components/forms/fields";
import { FileField } from "@/components/forms/file-field";
import { EmptyState, PageHeader } from "@/components/dashboard/primitives";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStudentPage } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { formatPrice } from "@/lib/utils/format";
import { getPaymentView } from "@/server/services/payments";
import { submitPaymentAction } from "@/app/student/actions";

export default async function PaymentPage({ searchParams }: { searchParams: Promise<{ flash?: string }> }) {
  const { flash } = await searchParams;
  const student = await requireStudentPage();
  const app = await getPrisma().application.findFirst({ where: { studentId: student.userId, certificateEligibleAt: { not: null } }, orderBy: { certificateEligibleAt: "desc" }, select: { id: true } });

  if (!app) {
    return (<><PageHeader title="Certificate payment" description="The internship is free. The certificate is optional." />
      <EmptyState title="Not available yet"><Lock className="mx-auto mb-2 size-5" aria-hidden="true" />This opens after your project is verified by a mentor.</EmptyState></>);
  }
  const view = await getPaymentView(student.userId, app.id);
  const status = view.payment?.status ?? "NOT_SUBMITTED";
  const amount = formatPrice(view.amount, view.currency);
  const canSubmit = status === "NOT_SUBMITTED" || status === "REJECTED";

  return (
    <>
      <PageHeader title="Certificate payment" description="Pay by UPI, then upload your proof. A person verifies every payment before your certificate is issued." actions={<StatusBadge value={status} />} />
      <Flash flash={flash} />
      {status === "UNDER_REVIEW" ? <Alert className="mb-6" title="Under review">We received your proof (UTR {view.payment?.utr}). You'll be notified once it is verified. Submitting proof does not issue a certificate by itself.</Alert> : null}
      {status === "REJECTED" ? <Alert variant="destructive" className="mb-6" title="Payment not verified">{view.payment?.rejectionReason ?? "Please check your details."} You can submit a new proof below.</Alert> : null}
      {status === "APPROVED" ? <Alert variant="success" className="mb-6" title="Payment approved">Your certificate is on the Certificate page.</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Certificate fee: {amount}</CardTitle></CardHeader><CardContent className="space-y-4">
          {view.upiId ? <div><p className="text-sm text-muted-foreground">UPI ID</p><p className="select-all font-mono text-lg font-semibold">{view.upiId}</p>{view.payeeName ? <p className="text-sm text-muted-foreground">{view.payeeName}</p> : null}</div>
            : <Alert variant="warning">The payment details have not been configured yet. Please contact support.</Alert>}
          {view.hasQr ? <div><p className="mb-2 text-sm text-muted-foreground">Scan to pay</p><Image src="/api/payment/qr" alt={`UPI QR code to pay ${amount}`} width={240} height={240} unoptimized className="rounded-lg border border-border bg-white p-2" /></div> : null}
          {view.instructions ? <p className="whitespace-pre-wrap text-sm text-muted-foreground">{view.instructions}</p> : (
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
              <li>Complete the {amount} payment in your UPI app.</li><li>Take a screenshot of the success screen.</li><li>Enter your UTR / transaction ID.</li><li>Upload the screenshot and submit.</li>
            </ol>)}
        </CardContent></Card>

        <Card><CardHeader><CardTitle>Submit payment proof</CardTitle></CardHeader><CardContent>
          {canSubmit ? (
            <ActionForm action={submitPaymentAction}>
              <input type="hidden" name="applicationId" value={app.id} />
              <TextField label="UTR / Transaction ID" name="utr" required autoComplete="off" placeholder="e.g. 412345678901" hint="8-30 letters or digits, exactly as shown in your UPI app." />
              <TextField label="Name on the payment (optional)" name="payerName" />
              <FileField label="Payment screenshot" name="screenshotFileId" purpose="PAYMENT_SCREENSHOT" required hint="PNG, JPG, WEBP or PDF" />
              <TextArea label="Remarks (optional)" name="remarks" rows={2} />
              <CheckField name="amountConfirmed" label={`I paid exactly ${amount}`} />
              <SubmitButton pendingLabel="Submitting…">Submit for verification</SubmitButton>
            </ActionForm>
          ) : <p className="text-sm text-muted-foreground">{status === "APPROVED" ? "Nothing more to do." : "You can submit again only if the review rejects your proof."}</p>}
        </CardContent></Card>
      </div>
    </>
  );
}
