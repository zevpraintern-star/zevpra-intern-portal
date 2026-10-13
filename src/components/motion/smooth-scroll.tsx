"use client";

import Lenis from "lenis";
import { useEffect } from "react";

import "lenis/dist/lenis.css";

/**
 * Inertia scrolling for the homepage flight. Skipped entirely for visitors who ask
 * for reduced motion, so their scrolling stays native.
 */
export function SmoothScroll() {
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (query.matches) return;

    const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.95, autoRaf: true });
    return () => lenis.destroy();
  }, []);

  return null;
}
