"use client";

import { motion, useReducedMotion, useScroll, useSpring } from "motion/react";
import { useRef } from "react";

import { JOURNEY_ICONS } from "@/components/home/journey";
import { Reveal } from "@/components/motion/reveal";
import { JOURNEY_STEPS, withFee } from "@/lib/content/journey";
import { cn } from "@/lib/utils/cn";

/**
 * Vertical timeline whose connecting line draws itself as you scroll. Steps
 * alternate sides on wide screens and stack on mobile.
 */
export function JourneyTimeline({ fee }: { fee: string }) {
  const ref = useRef<HTMLOListElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 70%", "end 60%"] });
  const draw = useSpring(scrollYProgress, { stiffness: 120, damping: 24 });

  return (
    <ol ref={ref} className="relative mx-auto max-w-4xl">
      <div
        aria-hidden="true"
        className="absolute bottom-0 left-5 top-0 w-px bg-border md:left-1/2 md:-translate-x-1/2"
      >
        <motion.div
          style={{ scaleY: reduced ? 1 : draw }}
          className="h-full origin-top bg-gradient-to-b from-[var(--brand-violet)] via-[var(--brand-cyan)] to-[var(--brand-amber)]"
        />
      </div>

      {JOURNEY_STEPS.map((step, index) => {
        const Icon = JOURNEY_ICONS[step.icon];
        const right = index % 2 === 1;
        return (
          <li key={step.title} className="relative pb-14 pl-14 last:pb-0 md:pl-0">
            <span className="absolute left-5 top-1 flex size-10 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-background text-primary md:left-1/2">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <Reveal
              className={cn(
                "md:w-[calc(50%-3rem)]",
                right ? "md:ml-[calc(50%+3rem)]" : "md:mr-[calc(50%+3rem)] md:text-right",
              )}
            >
              <p className="font-display text-sm text-primary">Step {index + 1}</p>
              <h2 className="mt-1 font-display text-2xl font-semibold">{step.title}</h2>
              <p className="mt-2 font-medium">{withFee(step.summary, fee)}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
                {step.detail}
              </p>
            </Reveal>
          </li>
        );
      })}
    </ol>
  );
}
