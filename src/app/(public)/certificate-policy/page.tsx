import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CertificatePolicyPage() {
  return (
    <div className="container-page py-12 max-w-4xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Certificate Policy</h1>
        <p className="text-sm text-muted-foreground mt-2">Effective date: January 2026</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">1. Eligibility Criteria</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground leading-relaxed space-y-2">
          <p>A completion certificate is awarded only after a student has completed required milestone assignments and submitted a valid, working public GitHub repository meeting the program's capstone criteria.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">2. Verification & Non-Accreditation Notice</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground leading-relaxed space-y-2">
          <p>Each certificate features a unique immutable identifier (e.g. CERT-...) verifiable online. Our certificates confirm educational internship completion and do not purport to be university degrees or government credentials.</p>
        </CardContent>
      </Card>
    </div>
  );
}
