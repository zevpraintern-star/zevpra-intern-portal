"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Search, CheckCircle, ShieldCheck, Loader2 } from "lucide-react";

/** Public snapshot returned by GET /api/certificates/verify. */
interface VerifiedCertificate {
  code: string;
  studentName: string;
  programTitle: string;
  domainName: string;
  duration: string;
  issuedAt: string | null;
}


export default function VerifyCertificatePage() {
  const [certId, setCertId] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [certificate, setCertificate] = useState<VerifiedCertificate | null>(null);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!certId.trim()) return;

    setLoading(true);
    setSearched(true);

    try {
      const res = await fetch(`/api/certificates/verify?id=${encodeURIComponent(certId.trim())}`);
      if (res.ok) {
        const body = await res.json();
        setCertificate(body?.data?.certificate ?? null);
      } else {
        setCertificate(null);
      }
    } catch {
      setCertificate(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container-page py-12 max-w-3xl">
      <div className="text-center mb-10">
        <Badge variant="outline" className="mb-4">Public Verification</Badge>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Verify an Internship Certificate</h1>
        <p className="mt-4 text-muted-foreground">
          Enter the unique Certificate ID (e.g. CERT-7F3K9Q2M) to verify its authenticity, recipient details, and completion record.
        </p>
      </div>

      <Card className="mb-8">
        <CardContent className="pt-6">
          <form onSubmit={handleVerify} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <Input
                placeholder="Enter Certificate ID (e.g. CERT-8X9Y2Z)"
                className="pl-9 font-mono uppercase"
                value={certId}
                onChange={(e) => setCertId(e.target.value.toUpperCase())}
                required
              />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ShieldCheck className="mr-2 size-4" />}
              Verify Now
            </Button>
          </form>
        </CardContent>
      </Card>

      {searched && !loading && (
        certificate ? (
          <Card className="border-primary/40">
            <CardHeader className="bg-primary/5 pb-4">
              <div className="flex items-center gap-2 text-primary font-semibold">
                <CheckCircle className="size-5" />
                <span>Authentic Certificate Verified</span>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground block">Recipient Name</span>
                  <span className="font-medium text-base">{certificate.studentName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Certificate ID</span>
                  <span className="font-mono font-medium text-base">{certificate.code}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Program Track</span>
                  <span className="font-medium">{certificate.programTitle}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Issue Date</span>
                  <span className="font-medium">{certificate.issuedAt ? new Date(certificate.issuedAt).toLocaleDateString() : "—"}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Alert variant="warning" title="Certificate Not Found">
            No active certificate matching ID "{certId}" was found in our records. Please verify the code or contact support.
          </Alert>
        )
      )}
    </div>
  );
}
