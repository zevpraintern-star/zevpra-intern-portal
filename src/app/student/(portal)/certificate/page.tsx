import { Award, Download, ExternalLink } from "lucide-react";
import Link from "next/link";

import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { DefinitionList, EmptyState, PageHeader } from "@/components/dashboard/primitives";
import { Flash } from "@/components/dashboard/flash";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireStudentPage } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { formatDate } from "@/lib/utils/format";
import { issueFreeCertificateAction } from "@/app/student/actions";

export default async function CertificatePage({ searchParams }: { searchParams: Promise<{ flash?: string }> }) {
  const student = await requireStudentPage();
  const { flash } = await searchParams;
  const [certs, eligibleApplications] = await Promise.all([
    getPrisma().certificate.findMany({ where: { studentId: student.userId }, orderBy: { createdAt: "desc" } }),
    getPrisma().application.findMany({
      where: { studentId: student.userId, completionStatus: "COMPLETED", certificateEligibleAt: { not: null } },
      orderBy: { certificateEligibleAt: "desc" },
      select: { id: true, program: { select: { title: true } } },
    }),
  ]);
  const missingCertificates = eligibleApplications.filter((application) => !certs.some((certificate) => certificate.applicationId === application.id));

  if (certs.length === 0) {
    return (<><PageHeader title="Certificate" />
      <Flash flash={flash} />
      {missingCertificates.length > 0 ? <div className="space-y-4">{missingCertificates.map((application) => <Card key={application.id}><CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6"><div><p className="font-semibold">{application.program.title}</p><p className="text-sm text-muted-foreground">Your project is approved. Your digital certificate is free.</p></div><ActionForm action={issueFreeCertificateAction}><input type="hidden" name="applicationId" value={application.id} /><SubmitButton>Get free certificate</SubmitButton></ActionForm></CardContent></Card>)}</div>
      : <EmptyState title="Not available yet">Your free certificate becomes available after your final project is approved.</EmptyState>}</>);
  }
  return (
    <>
      <PageHeader title="Certificate" />
      <Flash flash={flash} />
      {missingCertificates.length > 0 ? <div className="mb-6 space-y-4">{missingCertificates.map((application) => <Card key={application.id}><CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6"><div><p className="font-semibold">{application.program.title}</p><p className="text-sm text-muted-foreground">Your project is approved. Your digital certificate is free.</p></div><ActionForm action={issueFreeCertificateAction}><input type="hidden" name="applicationId" value={application.id} /><SubmitButton>Get free certificate</SubmitButton></ActionForm></CardContent></Card>)}</div> : null}
      <div className="space-y-4">
        {certs.map((c) => (
          <Card key={c.id}><CardContent className="space-y-5 pt-6">
            <div className="flex items-center justify-between"><div className="flex items-center gap-3"><Award className="size-6 text-primary" aria-hidden="true" /><p className="font-display text-lg font-semibold">{c.snapshotProgramTitle}</p></div><StatusBadge value={c.status} /></div>
            <DefinitionList items={[["Certificate ID", c.certificateId], ["Domain", c.snapshotDomainName], ["Duration", c.snapshotDuration], ["Issued", c.issueDate ? formatDate(c.issueDate) : "Being generated"]]} />
            {c.status === "PENDING" ? <Alert>Your certificate is being generated. This page updates in a moment.</Alert> : null}
            {c.status === "REVOKED" ? <Alert variant="destructive">This certificate has been revoked{c.revocationReason ? `: ${c.revocationReason}` : "."}</Alert> : null}
            {c.status === "GENERATED" && c.pdfFileId ? (
              <div className="flex flex-wrap gap-3">
                <Button asChild><a href={`/api/files/${c.pdfFileId}`} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" />View / print</a></Button>
                <Button asChild variant="outline"><a href={`/api/files/${c.pdfFileId}`} download={`${c.certificateId}.pdf`}><Download aria-hidden="true" />Download PDF</a></Button>
                <Button asChild variant="outline"><Link href={`/verify-certificate/${c.verificationId}`} target="_blank">Public verification page</Link></Button>
              </div>) : null}
          </CardContent></Card>
        ))}
      </div>
    </>
  );
}
