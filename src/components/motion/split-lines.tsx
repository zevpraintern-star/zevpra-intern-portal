"use client";

import { motion, useReducedMotion } from "motion/react";
import type { CSSProperties } from "react";

interface SplitLinesProps {
  lines: readonly string[];
  className?: string;
  lineClassName?: string;
  /** Seconds before the first line starts. */
  delay?: number;
  stagger?: number;
  /** Per-line inline style, e.g. a stair-step indent. */
  lineStyle?: (index: number) => CSSProperties;
}

/**
 * Masked line-by-line headline reveal: each line rises out of a clipping box.
 * Used once, on the hero, as the page's single orchestrated entrance.
 */
export function SplitLines({
  lines,
  className,
  lineClassName,
  delay = 0.4,
  stagger = 0.14,
  lineStyle,
}: SplitLinesProps) {
  const reduced = useReducedMotion();

  return (
    <span className={className}>
      {lines.map((line, index) => (
        <span
          key={line}
          className="block overflow-hidden pb-[0.08em]"
          style={lineStyle?.(index)}
        >
          <motion.span
            className={`block ${lineClassName ?? ""}`}
            initial={reduced ? false : { y: "112%", rotate: 3 }}
            animate={{ y: "0%", rotate: 0 }}
            transition={{
              duration: 1.1,
              delay: delay + index * stagger,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            {line}
          </motion.span>
        </span>
      ))}
    </span>
  );
}
