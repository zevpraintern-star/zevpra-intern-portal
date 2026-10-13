"use client";

import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import type { ReactNode } from "react";
import { useRef } from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Card with a cursor-following highlight and a gentle 3D tilt. The highlight is
 * driven by CSS variables, so it costs nothing while the pointer is elsewhere.
 */
export function SpotlightCard({
  children,
  className,
  tilt = 6,
}: {
  children: ReactNode;
  className?: string;
  /** Maximum tilt in degrees; 0 disables tilt and keeps only the highlight. */
  tilt?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const spring = { stiffness: 180, damping: 18, mass: 0.5 };
  const rotateY = useSpring(useTransform(px, [0, 1], [-tilt, tilt]), spring);
  const rotateX = useSpring(useTransform(py, [0, 1], [tilt, -tilt]), spring);

  const onMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || event.pointerType !== "mouse") return;
    const rect = el.getBoundingClientRect();
    const nx = (event.clientX - rect.left) / rect.width;
    const ny = (event.clientY - rect.top) / rect.height;
    px.set(nx);
    py.set(ny);
    el.style.setProperty("--mx", `${nx * 100}%`);
    el.style.setProperty("--my", `${ny * 100}%`);
  };

  const reset = () => {
    px.set(0.5);
    py.set(0.5);
  };

  return (
    <motion.div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={reset}
      style={
        reduced || tilt === 0
          ? undefined
          : { rotateX, rotateY, transformPerspective: 900, transformStyle: "preserve-3d" }
      }
      className={cn("spotlight-card relative", className)}
    >
      {children}
    </motion.div>
  );
}
