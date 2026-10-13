import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PrivacyPolicyPage() {
  return (
    <div className="container-page py-12 max-w-4xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mt-2">Effective date: January 2026 | Version 2026-01</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">1. Information We Collect</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground leading-relaxed space-y-2">
          <p>We only collect the minimum personal data required to administer your internship programs:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Basic student contact information: Full Name, Email, and Mobile number.</li>
            <li>Academic profile: College/Institution name, Degree, Branch, and Graduation year.</li>
            <li>Submissions: Code repositories (GitHub URLs) and task files.</li>
            <li>Payment proofs: UPI transaction UTR and optional payment screenshots (used only for manual verification).</li>
          </ul>
          <p>We do not collect Aadhaar, PAN, banking login credentials, or unnecessary personal documents.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">2. Purpose and Usage</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground leading-relaxed space-y-2">
          <p>Your data is used strictly for authentication, email communication (OTP codes, submission notices), mentor grading, and certificate verification.</p>
          <p>We do not sell, rent, or monetize your contact details with third-party marketing companies.</p>
        </CardContent>
      </Card>
    </div>
  );
}
