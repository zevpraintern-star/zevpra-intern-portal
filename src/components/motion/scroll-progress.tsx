"use client";

import { motion, useScroll, useSpring } from "motion/react";

/** Thin page-progress bar pinned to the top edge. Decorative, hidden from assistive tech. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 28, mass: 0.4 });

  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX }}
      className="no-print fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-gradient-to-r from-[var(--brand-violet)] via-[var(--brand-cyan)] to-[var(--brand-amber)]"
    />
  );
}
