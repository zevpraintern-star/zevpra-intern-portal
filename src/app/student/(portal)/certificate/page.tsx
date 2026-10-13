import { Award, Download, ExternalLink } from "lucide-react";
import Link from "next/link";

import { DefinitionList, EmptyState, PageHeader } from "@/components/dashboard/primitives";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireStudentPage } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { formatDate } from "@/lib/utils/format";

export default async function CertificatePage() {
  const student = await requireStudentPage();
  const certs = await getPrisma().certificate.findMany({ where: { studentId: student.userId }, orderBy: { createdAt: "desc" } });
  const eligible = await getPrisma().application.count({ where: { studentId: student.userId, certificateEligibleAt: { not: null } } });

  if (certs.length === 0) {
    return (<><PageHeader title="Certificate" />
      {eligible > 0 ? <EmptyState title="You're eligible for a certificate"><Button asChild className="mt-3"><Link href="/student/payment">Get your certificate</Link></Button></EmptyState>
      : <EmptyState title="Not available yet">Your certificate becomes available after your project is verified. The internship itself is always free.</EmptyState>}</>);
  }
  return (
    <>
      <PageHeader title="Certificate" />
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
