import type { Metadata } from "next";

import { WorldCanvas } from "@/components/3d/world-canvas";
import { Assurances } from "@/components/home/assurances";
import { CertificateShowcase } from "@/components/home/certificate-showcase";
import { DomainPanels } from "@/components/home/domain-panels";
import { FinalCta } from "@/components/home/final-cta";
import { Hero } from "@/components/home/hero";
import { Journey } from "@/components/home/journey";
import { Marquee } from "@/components/motion/marquee";
import { ScrollProgress } from "@/components/motion/scroll-progress";
import { SmoothScroll } from "@/components/motion/smooth-scroll";
import { getBranding } from "@/lib/config/branding";
import { getDomainGroups } from "@/server/queries/domains";

/**
 * Homepage: one continuous flight.
 *
 * The page is ordinary, fully server-rendered HTML sections. A fixed 3D world sits
 * behind them and a scroll driver flies its camera along a path, with each section
 * (data-stage) owning one stretch of the journey. Nothing in the content depends on
 * WebGL, so crawlers, screen readers and reduced-motion visitors get the same page.
 *
 * Domain data is re-read at most once an hour; admins' changes appear without a deploy.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const BENEFITS = [
  "Free internship",
  "Practical projects",
  "Structured tasks",
  "Online learning",
  "Verified certificates",
  "Multiple engineering domains",
] as const;

export default async function HomePage() {
  const branding = getBranding();
  const groups = await getDomainGroups();

  return (
    <>
      <SmoothScroll />
      <ScrollProgress />
      <WorldCanvas />

      <div className="relative z-10">
        <Hero />

        <Marquee
          items={[...BENEFITS, ...groups.map((group) => group.name)]}
          className="border-y border-border/60 bg-background/30 py-5 font-display text-xl text-muted-foreground backdrop-blur-sm sm:text-2xl"
        />

        <DomainPanels groups={groups} />
        <Journey />

        <div data-stage="certificate">
          <CertificateShowcase
            companyName={branding.companyName}
            domain={branding.domain}
          />
          <Assurances />
        </div>

        <FinalCta />
      </div>
    </>
  );
}
