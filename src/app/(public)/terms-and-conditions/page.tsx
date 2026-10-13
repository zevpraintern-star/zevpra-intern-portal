import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TermsPage() {
  return (
    <div className="container-page py-12 max-w-4xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Terms & Conditions</h1>
        <p className="text-sm text-muted-foreground mt-2">Effective date: January 2026 | Version 2026-01</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">1. Program Nature & Free Access</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground leading-relaxed space-y-2">
          <p>Enrolling in our internship tracks, accessing course materials, submitting tasks, and receiving feedback is entirely free.</p>
          <p>This platform offers educational internship simulations designed to build engineering portfolio projects. It does not constitute formal employment or guaranteed job placement.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">2. GitHub Submissions & Intellectual Property</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground leading-relaxed space-y-2">
          <p>Students retain full intellectual property ownership over their capstone project code created during the internship. All final projects must be hosted on GitHub under an open-source license or readable public repository.</p>
        </CardContent>
      </Card>
    </div>
  );
}
