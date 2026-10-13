import { BadgeCheck, ShieldAlert, ShieldX } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";

import { PageHero } from "@/components/layout/page-hero";
import { clientIpFromHeaders, consumeRateLimit, rateLimits } from "@/lib/redis/rate-limit";
import { formatDate } from "@/lib/utils/format";
import { verifyCertificate } from "@/server/services/certificates";
import { securityEvent } from "@/server/services/audit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Certificate verification", robots: { index: false, follow: false } };

/** QR codes on printed certificates land here. Only the minimum public fields are shown. */
export default async function VerifyPage({ params }: { params: Promise<{ verificationId: string }> }) {
  const { verificationId } = await params;
  const ip = clientIpFromHeaders(await headers());
  const limit = await consumeRateLimit(rateLimits.certificateVerify(ip));
  const valid = /^[A-Za-z0-9-]{6,64}$/.test(verificationId);
  const result = limit.allowed && valid ? await verifyCertificate(verificationId) : null;
  if (limit.allowed && (!valid || result?.status === "NOT_FOUND")) await securityEvent("INVALID_CERTIFICATE_REQUEST", "LOW", { ipAddress: ip, detail: { reason: valid ? "unknown_id" : "malformed_id" } });

  return (
    <>
      <PageHero title="Certificate verification" />
      <div className="container-page max-w-xl py-14">
        {!limit.allowed ? (<div role="alert" className="rounded-2xl border border-border p-8 text-center"><ShieldAlert className="mx-auto size-10 text-[var(--brand-amber)]" aria-hidden="true" /><p className="mt-3 font-medium">Too many lookups</p><p className="text-sm text-muted-foreground">Please wait a minute and try again.</p></div>)
        : result?.status === "VALID" ? (
          <div className="rounded-2xl border border-success/40 bg-success/5 p-8" role="status"><BadgeCheck className="size-10 text-success" aria-hidden="true" /><h2 className="mt-3 font-display text-2xl font-semibold">Certificate valid</h2>
            <dl className="mt-6 space-y-4 text-sm"><div><dt className="text-muted-foreground">Certificate ID</dt><dd className="font-mono font-medium">{result.certificate.certificateId}</dd></div><div><dt className="text-muted-foreground">Student</dt><dd className="font-medium">{result.certificate.studentName}</dd></div><div><dt className="text-muted-foreground">Internship</dt><dd className="font-medium">{result.certificate.programTitle}</dd></div><div><dt className="text-muted-foreground">Domain</dt><dd className="font-medium">{result.certificate.domainName}</dd></div><div><dt className="text-muted-foreground">Issued</dt><dd className="font-medium">{result.certificate.issuedAt ? formatDate(result.certificate.issuedAt) : "-"}</dd></div></dl></div>)
        : result?.status === "REVOKED" ? (<div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-8" role="alert"><ShieldX className="size-10 text-destructive" aria-hidden="true" /><h2 className="mt-3 font-display text-2xl font-semibold">Certificate revoked</h2><p className="mt-2 text-sm text-muted-foreground">Certificate {result.certificate.certificateId} is no longer valid{result.certificate.revokedAt ? ` (revoked ${formatDate(result.certificate.revokedAt)})` : ""}.</p></div>)
        : (<div className="rounded-2xl border border-border p-8" role="alert"><ShieldX className="size-10 text-muted-foreground" aria-hidden="true" /><h2 className="mt-3 font-display text-2xl font-semibold">Certificate not found</h2><p className="mt-2 text-sm text-muted-foreground">We have no certificate matching this link. Check the ID and try again.</p></div>)}
      </div>
    </>
  );
}
