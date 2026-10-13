"use client";

import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Header chrome that reacts to scrolling: transparent at the top so the 3D world
 * shows through, frosted once the page moves, and tucked away while scrolling down
 * so the flight stays immersive. It returns as soon as the visitor scrolls up or a
 * control inside it receives keyboard focus.
 */
export function HeaderShell({ children }: { children: ReactNode }) {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);

  useMotionValueEvent(scrollY, "change", (latest) => {
    const previous = scrollY.getPrevious() ?? 0;
    setScrolled(latest > 24);
    setHidden(latest > 480 && latest > previous);
  });

  return (
    <motion.header
      animate={{ y: hidden ? "-100%" : "0%" }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      onFocusCapture={() => setHidden(false)}
      className={cn(
        "sticky top-0 z-40 w-full border-b transition-[background-color,border-color,backdrop-filter] duration-300",
        scrolled
          ? "border-border bg-background/70 backdrop-blur-xl"
          : "border-transparent bg-transparent",
      )}
    >
      {children}
    </motion.header>
  );
}
