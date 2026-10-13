"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import { motion, useScroll, useTransform } from "motion/react";
import Link from "next/link";
import { useRef } from "react";

import { Magnetic } from "@/components/motion/magnetic";
import { SplitLines } from "@/components/motion/split-lines";
import { Button } from "@/components/ui/button";

const LINES = ["Learn.", "Build.", "Intern.", "Grow."] as const;

/**
 * The opening shot. The four words climb in a staircase (the progression is the
 * message), and the whole block drifts up and fades as the camera leaves the globe.
 */
export function Hero({ fee }: { fee: string }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const opacity = useTransform(scrollYProgress, [0, 0.65], [1, 0]);
  const y = useTransform(scrollYProgress, [0, 1], [0, -90]);

  return (
    <section
      ref={ref}
      data-stage="hero"
      aria-labelledby="hero-heading"
      className="relative flex min-h-[100svh] items-end pb-20 pt-28 sm:items-center sm:pb-24"
    >
      <motion.div style={{ opacity, y }} className="container-page w-full">
        <div className="max-w-2xl">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.7 }}
            className="world-panel mb-7 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm"
          >
            <Sparkles className="size-3.5 text-[var(--brand-amber)]" aria-hidden="true" />
            Registration is free
          </motion.p>

          <h1 id="hero-heading">
            <SplitLines
              lines={LINES}
              className="font-display text-[clamp(3rem,min(9.5vw,12.5svh),8rem)] font-semibold leading-[0.92]"
              lineStyle={(index) => ({ paddingLeft: `${index * 0.34}em` })}
            />
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="mt-8 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg"
          >
            Free online internships designed to help engineering students build practical skills
            through structured learning, tasks and projects.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.4, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="mt-9 flex flex-col gap-3 sm:flex-row"
          >
            <Magnetic>
              <Button asChild size="lg" className="h-12 w-full px-7 sm:w-auto">
                <Link href="/internships">
                  Explore internships
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </Magnetic>
            <Magnetic>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="world-panel h-12 w-full px-7 hover:bg-accent sm:w-auto"
              >
                <Link href="/register">Register free</Link>
              </Button>
            </Magnetic>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.7, duration: 0.8 }}
            className="mt-6 text-sm text-muted-foreground"
          >
            No payment is needed to join. The certificate is optional and costs {fee}.
          </motion.p>
        </div>
      </motion.div>

      <div
        aria-hidden="true"
        className="absolute bottom-8 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-xs text-muted-foreground sm:flex"
      >
        Scroll to fly through
        <span className="scroll-cue relative block h-10 w-px overflow-hidden bg-border" />
      </div>
    </section>
  );
}
