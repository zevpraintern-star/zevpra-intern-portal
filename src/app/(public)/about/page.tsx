import { PageHero } from "@/components/layout/page-hero";
import { Reveal } from "@/components/motion/reveal";
import { getBranding } from "@/lib/config/branding";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, Target, HeartHandshake, BookOpen } from "lucide-react";

export default function AboutPage() {
  const branding = getBranding();

  return (
    <>
      <PageHero
        title="Built for practical engineering skills."
        description="High-quality engineering internships should be open to every student, whatever their college or budget. We pair structured tasks and a real project with mentor review."
      />
      <div className="container-page py-16 sm:py-20">
      <Reveal className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3">
              <ShieldCheck className="size-5" />
            </div>
            <CardTitle>Zero Fake Claims</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground leading-relaxed">
            We don't manufacture placement statistics, claim unearned government/university credentials, or make false job guarantees. Our certificates clearly state the skills you developed, the project you built, and the repository URL that anyone can inspect.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3">
              <HeartHandshake className="size-5" />
            </div>
            <CardTitle>100% Free Learning & Submissions</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground leading-relaxed">
            Joining our tracks, working on modules, receiving task feedback, and submitting your final GitHub repository is entirely free. A nominal fee of {branding.currency} {branding.certificateFee} is charged only if you request a manual-verified digital certificate to cover processing costs.
          </CardContent>
        </Card>
      </Reveal>
      </div>
    </>
  );
}
