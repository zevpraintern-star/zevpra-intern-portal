"use client";

import { useEffect } from "react";

import { mapScrollToPath, STAGE_ORDER, worldState } from "./world-state";

/**
 * Connects page scroll and pointer movement to the shared world state.
 *
 * Sections declare themselves with data-stage="hero" | "domains" | ...; their
 * document offsets are measured here (and re-measured on resize or layout shift).
 */
export function useScrollDriver(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    let tops: number[] = STAGE_ORDER.map(() => Number.NaN);
    let maxScroll = 1;
    let frame = 0;

    const measure = () => {
      tops = STAGE_ORDER.map((id) => {
        const el = document.querySelector<HTMLElement>(`[data-stage="${id}"]`);
        return el ? el.getBoundingClientRect().top + window.scrollY : Number.NaN;
      });
      maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    };

    const update = () => {
      frame = 0;
      const { t, journey } = mapScrollToPath(window.scrollY, tops, maxScroll);
      worldState.target = t;
      worldState.journey = journey;
    };

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    const onResize = () => {
      measure();
      schedule();
    };

    const onPointer = (event: PointerEvent) => {
      worldState.pointerX = (event.clientX / window.innerWidth) * 2 - 1;
      worldState.pointerY = -((event.clientY / window.innerHeight) * 2 - 1);
    };

    measure();
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onPointer, { passive: true });

    // Fonts, images and hydration can shift section offsets after first paint.
    const observer = new ResizeObserver(onResize);
    observer.observe(document.body);
    const settle = window.setTimeout(onResize, 800);

    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointer);
      observer.disconnect();
      window.clearTimeout(settle);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [enabled]);
}
