import { Award, Download, ExternalLink } from "lucide-react";
import Link from "next/link";

import { DefinitionList, EmptyState, PageHeader } from "@/components/dashboard/primitives";
import { Flash } from "@/components/dashboard/flash";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireStudentPage } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { formatDate } from "@/lib/utils/format";

export default async function CertificatePage({ searchParams }: { searchParams: Promise<{ flash?: string }> }) {
  const student = await requireStudentPage();
  const { flash } = await searchParams;
  const [certs, completedApplications] = await Promise.all([
    getPrisma().certificate.findMany({ where: { studentId: student.userId }, orderBy: { createdAt: "desc" } }),
    getPrisma().application.findMany({
      where: { studentId: student.userId, completionStatus: "COMPLETED" },
      orderBy: { certificateEligibleAt: "desc" },
      select: { id: true, certificateEligibleAt: true, program: { select: { title: true } } },
    }),
  ]);
  const eligibleApplications = completedApplications.filter((application) => application.certificateEligibleAt !== null);
  const belowThresholdApplications = completedApplications.filter((application) => application.certificateEligibleAt === null);
  const releasedCertificates = certs.filter((certificate) => certificate.status !== "PENDING");
  const awaitingRelease = eligibleApplications.filter((application) => !certs.some(
    (certificate) => certificate.applicationId === application.id && ["GENERATED", "REVOKED"].includes(certificate.status),
  ));

  return (
    <>
      <PageHeader title="Certificate" />
      <Flash flash={flash} />
      {belowThresholdApplications.map((application) => <Card key={application.id} className="mb-4"><CardContent className="pt-6"><p className="font-semibold">{application.program.title}</p><p className="mt-1 text-sm text-muted-foreground">Certificate eligibility requires an overall score greater than 85% across graded tasks and the final project. This completed internship does not meet that threshold.</p></CardContent></Card>)}
      {awaitingRelease.map((application) => <Card key={application.id} className="mb-4"><CardContent className="pt-6"><p className="font-semibold">{application.program.title}</p><p className="mt-1 text-sm text-muted-foreground">Your final project is approved. An administrator will release your free certificate here. We’ll notify you by email and in the portal when it’s ready.</p></CardContent></Card>)}
      {releasedCertificates.length === 0 && awaitingRelease.length === 0 ? <EmptyState title="Not available yet">Your free certificate becomes available after your final project is approved and an administrator releases it.</EmptyState> : null}
      <div className="space-y-4">
        {releasedCertificates.map((c) => (
          <Card key={c.id}><CardContent className="space-y-5 pt-6">
            <div className="flex items-center justify-between"><div className="flex items-center gap-3"><Award className="size-6 text-primary" aria-hidden="true" /><p className="font-display text-lg font-semibold">{c.snapshotProgramTitle}</p></div><StatusBadge value={c.status} /></div>
            <DefinitionList items={[["Certificate ID", c.certificateId], ["Domain", c.snapshotDomainName], ["Duration", c.snapshotDuration], ["Issued", c.issueDate ? formatDate(c.issueDate) : "Being generated"]]} />
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
