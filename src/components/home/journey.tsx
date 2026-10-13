"use client";

import {
  Award,
  Compass,
  GitBranch,
  ListChecks,
  Mail,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import { useRef, useState } from "react";

import {
  JOURNEY_STEPS,
  withFee,
  type JourneyIcon,
} from "@/lib/content/journey";
import { JOURNEY_SLOTS } from "@/components/3d/world-state";
import { cn } from "@/lib/utils/cn";

export const JOURNEY_ICONS: Record<JourneyIcon, LucideIcon> = {
  mail: Mail,
  compass: Compass,
  tasks: ListChecks,
  project: GitBranch,
  verify: ShieldCheck,
  certificate: Award,
};

/**
 * Pinned panel that follows the camera through the six gates.
 *
 * The section is 7 viewport-heights tall (6 pinned steps plus the exit), measured
 * with the same formula the 3D scroll driver uses, so step N is always shown while
 * the camera is passing gate N. A complete, ordered version of the content is kept
 * in the DOM for screen readers and search engines.
 */
export function Journey({ fee }: { fee: string }) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const [active, setActive] = useState(0);

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    const next = Math.min(JOURNEY_STEPS.length - 1, Math.max(0, Math.floor(value * JOURNEY_SLOTS)));
    setActive((current) => (current === next ? current : next));
  });

  const railFill = useTransform(scrollYProgress, [0, (JOURNEY_SLOTS - 1) / JOURNEY_SLOTS], [0, 1]);
  const step = JOURNEY_STEPS[active] ?? JOURNEY_STEPS[0]!;
  const Icon = JOURNEY_ICONS[step.icon];

  return (
    <section
      ref={ref}
      data-stage="journey"
      aria-labelledby="journey-heading"
      className="relative"
      style={{ height: `${JOURNEY_SLOTS * 100}svh` }}
    >
      <ol className="sr-only">
        {JOURNEY_STEPS.map((s) => (
          <li key={s.title}>
            {s.title}. {withFee(s.summary, fee)} {s.detail}
          </li>
        ))}
      </ol>

      <div className="sticky top-0 flex h-svh flex-col justify-between overflow-hidden pb-6 pt-24 sm:pb-12">
        <div className="container-page">
          <h2
            id="journey-heading"
            className="font-display text-3xl font-semibold leading-tight sm:text-5xl"
          >
            Six gates from sign-up
            <br className="hidden sm:block" /> to certificate.
          </h2>
        </div>

        <div className="container-page" aria-hidden="true">
          <div className="flex items-end gap-4 sm:gap-8">
            <div className="hidden h-56 w-px shrink-0 sm:block">
              <div className="relative h-full w-px bg-border">
                <motion.div
                  style={{ scaleY: railFill }}
                  className="absolute inset-0 origin-top bg-gradient-to-b from-[var(--brand-violet)] to-[var(--brand-cyan)]"
                />
                {JOURNEY_STEPS.map((s, i) => (
                  <span
                    key={s.title}
                    className={cn(
                      "absolute left-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border transition-colors duration-300",
                      i <= active
                        ? "border-[var(--brand-cyan)] bg-[var(--brand-cyan)]"
                        : "border-border bg-background",
                    )}
                    style={{ top: `${(i / (JOURNEY_STEPS.length - 1)) * 100}%` }}
                  />
                ))}
              </div>
            </div>

            <div className="min-h-[19rem] w-full max-w-lg sm:min-h-[17rem]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={active}
                  initial={reduced ? false : { opacity: 0, y: 36, filter: "blur(10px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={reduced ? undefined : { opacity: 0, y: -28, filter: "blur(10px)" }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  className="world-panel rounded-2xl p-6 sm:p-8"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display text-6xl font-semibold leading-none text-primary sm:text-7xl">
                      {String(active + 1).padStart(2, "0")}
                    </span>
                    <span className="inline-flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="size-6" />
                    </span>
                  </div>
                  <h3 className="mt-5 font-display text-2xl font-semibold sm:text-3xl">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-base font-medium text-foreground/90">
                    {withFee(step.summary, fee)}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {step.detail}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
