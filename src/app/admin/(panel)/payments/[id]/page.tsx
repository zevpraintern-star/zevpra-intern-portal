import { notFound } from "next/navigation";

import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { TextArea } from "@/components/forms/fields";
import { DefinitionList, PageHeader } from "@/components/dashboard/primitives";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { can, requireStaffPage } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { uuidSchema } from "@/lib/validation/common";
import { formatDateTime, formatPrice } from "@/lib/utils/format";
import { reviewPaymentAction } from "@/app/admin/actions";

export default async function PaymentDetail({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffPage("payments.view");
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const p = await getPrisma().paymentRequest.findUnique({
    where: { id },
    include: { student: { select: { name: true, email: true, studentProfile: { select: { mobile: true, college: true } } } }, program: { select: { title: true } }, application: { select: { certificateEligibleAt: true, completionStatus: true } }, screenshots: { orderBy: { createdAt: "desc" }, include: { file: { select: { id: true, originalName: true, mimeType: true } } } }, certificate: { select: { certificateId: true, status: true } } },
  });
  if (!p) notFound();
  const shot = p.screenshots.find((s) => s.isPrimary) ?? p.screenshots[0];
  const duplicates = p.utr ? await getPrisma().paymentRequest.count({ where: { utr: p.utr, id: { not: p.id } } }) : 0;
  const canReview = can(staff, "payments.review") && p.status === "UNDER_REVIEW";
  return (
    <>
      <PageHeader title="Payment verification" description={`${p.student.name} · ${p.program.title}`} actions={<StatusBadge value={p.status} />} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Details</CardTitle></CardHeader><CardContent className="space-y-4">
          <DefinitionList items={[["Student", p.student.name], ["Email", p.student.email], ["Mobile", p.student.studentProfile?.mobile], ["Internship", p.program.title], ["Amount expected", formatPrice(Number(p.amount), p.currency)], ["UTR / transaction ID", <span key="u" className="select-all font-mono">{p.utr ?? "-"}</span>], ["Payer name", p.payerName], ["UPI ID used", p.upiIdUsed], ["Submitted", p.submittedAt ? formatDateTime(p.submittedAt) : "-"], ["Attempts", p.submissionCount], ["Certificate-eligible since", p.application.certificateEligibleAt ? formatDateTime(p.application.certificateEligibleAt) : "NOT ELIGIBLE"]]} />
          {p.remarks ? <p className="text-sm"><span className="text-muted-foreground">Student remarks: </span>{p.remarks}</p> : null}
          {duplicates > 0 ? <Alert variant="destructive" title="Duplicate UTR">This UTR appears on another payment request. Investigate before approving.</Alert> : null}
          {!p.application.certificateEligibleAt ? <Alert variant="destructive">This student has not completed the internship.</Alert> : null}
          {p.status === "REJECTED" && p.rejectionReason ? <Alert variant="warning" title="Rejected">{p.rejectionReason}</Alert> : null}
          {p.certificate ? <Alert variant="success">Certificate {p.certificate.certificateId} ({p.certificate.status.toLowerCase()}).</Alert> : null}
        </CardContent></Card>

        <div className="space-y-6">
          <Card><CardHeader><CardTitle>Payment screenshot</CardTitle></CardHeader><CardContent>
            {shot ? (shot.file.mimeType.startsWith("image/")
              // eslint-disable-next-line @next/next/no-img-element
              ? <a href={`/api/files/${shot.file.id}`} target="_blank" rel="noopener noreferrer"><img src={`/api/files/${shot.file.id}`} alt={`Payment screenshot from ${p.student.name}`} className="max-h-[28rem] w-full rounded-lg border border-border object-contain" /></a>
              : <a className="text-primary hover:underline" href={`/api/files/${shot.file.id}`} target="_blank" rel="noopener noreferrer">Open {shot.file.originalName}</a>)
              : <p className="text-sm text-muted-foreground">No screenshot uploaded.</p>}
            <p className="mt-2 text-xs text-muted-foreground">Served through a short-lived signed link after a permission check.</p>
          </CardContent></Card>

          {canReview ? (
            <Card><CardHeader><CardTitle>Decision</CardTitle></CardHeader><CardContent className="space-y-5">
              <ActionForm action={reviewPaymentAction}><input type="hidden" name="paymentRequestId" value={p.id} /><input type="hidden" name="decision" value="APPROVED" /><SubmitButton className="w-full" pendingLabel="Approving…">Approve payment and issue certificate</SubmitButton></ActionForm>
              <ActionForm action={reviewPaymentAction}><input type="hidden" name="paymentRequestId" value={p.id} /><input type="hidden" name="decision" value="REJECTED" /><TextArea label="Rejection reason (shown to the student)" name="reason" rows={3} required /><SubmitButton variant="destructive" className="w-full">Reject payment</SubmitButton></ActionForm>
            </CardContent></Card>) : null}
        </div>
      </div>
    </>
  );
}
