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
        <CardHeader><CardTitle className="text-lg">2. Certificate Fee Refunds</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground leading-relaxed space-y-2">
          <p>The optional ₹50 manual verification fee covers administrative review costs. If an accidental duplicate payment is made, students can contact support with both UTRs to receive a full refund within 3 business days.</p>
        </CardContent>
      </Card>
    </div>
  );
}
