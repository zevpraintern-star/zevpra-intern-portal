import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { JourneyTimeline } from "@/components/home/journey-timeline";
import { PageHero } from "@/components/layout/page-hero";
import { Magnetic } from "@/components/motion/magnetic";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "How it works",
  alternates: { canonical: "/how-it-works" },
};

export default function HowItWorksPage() {
  return (
    <>
      <PageHero
        title="Six steps from sign-up to certificate."
        description="The internship and digital certificate are free. Your certificate is prepared after your final project is approved."
      />
      <div className="container-page py-16 sm:py-24">
        <JourneyTimeline />
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
