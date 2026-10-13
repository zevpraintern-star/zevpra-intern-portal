import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { JourneyTimeline } from "@/components/home/journey-timeline";
import { PageHero } from "@/components/layout/page-hero";
import { Magnetic } from "@/components/motion/magnetic";
import { Button } from "@/components/ui/button";
import { getBranding } from "@/lib/config/branding";
import { formatPrice } from "@/lib/utils/format";

export const metadata: Metadata = {
  title: "How it works",
  alternates: { canonical: "/how-it-works" },
};

export default function HowItWorksPage() {
  const branding = getBranding();
  const fee = formatPrice(branding.certificateFee, branding.currency);

  return (
    <>
      <PageHero
        title="Six steps from sign-up to certificate."
        description="The internship is free from start to finish. Only the optional certificate has a fee, and a person checks every payment."
      />
      <div className="container-page py-16 sm:py-24">
        <JourneyTimeline fee={fee} />
        <div className="mt-20 flex justify-center">
          <Magnetic>
            <Button asChild size="lg" className="h-12 px-8">
              <Link href="/register">
                Register free
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </Magnetic>
        </div>
      </div>
    </>
  );
}
