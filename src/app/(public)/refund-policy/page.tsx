import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function RefundPolicyPage() {
  return (
    <div className="container-page py-12 max-w-4xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Refund Policy</h1>
        <p className="text-sm text-muted-foreground mt-2">Effective date: January 2026</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">1. Free Internship Guarantee</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground leading-relaxed space-y-2">
          <p>All core learning tracks and project grading are completely free. There are no registration charges to refund.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">2. Certificate payments made before this change</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground leading-relaxed space-y-2">
          <p>Certificates are now free, and we no longer accept certificate payments. If you made a certificate payment before this change and need help, contact support with your transaction details. We will review the request and respond.</p>
        </CardContent>
      </Card>
    </div>
  );
}
