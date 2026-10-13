import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Magnetic } from "@/components/motion/magnetic";
import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";

export function FinalCta({ fee }: { fee: string }) {
  return (
    <section
      data-stage="cta"
      aria-labelledby="cta-heading"
      className="relative flex min-h-[100svh] items-end pb-[14svh]"
    >
      <div className="container-page text-center">
        <Reveal>
          <h2
            id="cta-heading"
            className="mx-auto max-w-3xl text-balance font-display text-5xl font-semibold leading-[0.98] sm:text-7xl"
          >
            Your first task is one sign-up away.
          </h2>
          <p className="mx-auto mt-6 max-w-md text-base text-muted-foreground sm:text-lg">
            Create your account with an email code, pick a domain and start. Joining costs nothing.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Magnetic>
              <Button asChild size="lg" className="h-13 px-8 text-base">
                <Link href="/register">
                  Register free
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </Magnetic>
            <Magnetic>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="world-panel h-13 px-8 text-base hover:bg-accent"
              >
                <Link href="/how-it-works">See how it works</Link>
              </Button>
            </Magnetic>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">Optional certificate: {fee}.</p>
        </Reveal>
      </div>
    </section>
  );
}
