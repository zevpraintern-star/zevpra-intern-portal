import type { ReactNode } from "react";

import { Reveal } from "@/components/motion/reveal";

/**
 * Shared header for inner pages: drifting colour orbs and a fading grid behind a
 * large title. Pure CSS animation (disabled under reduced motion by globals.css).
 */
export function PageHero({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <section className="relative isolate overflow-hidden border-b border-border/60">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="bg-grid absolute inset-0" />
        <div className="page-orb absolute -left-24 -top-24 size-[26rem] rounded-full bg-[var(--brand-violet)] opacity-20 blur-3xl" />
        <div
          className="page-orb absolute -right-16 top-10 size-[22rem] rounded-full bg-[var(--brand-cyan)] opacity-15 blur-3xl"
          style={{ animationDelay: "-6s" }}
        />
      </div>
      <div className="container-page py-16 sm:py-24">
        <Reveal className="max-w-3xl">
          <h1 className="text-balance font-display text-4xl font-semibold leading-[1.02] sm:text-6xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              {description}
            </p>
          ) : null}
          {children}
        </Reveal>
      </div>
    </section>
  );
}
