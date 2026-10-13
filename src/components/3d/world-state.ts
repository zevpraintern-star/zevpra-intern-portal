/**
 * Shared, mutable scene state.
 *
 * Scroll position and pointer movement change dozens of times per second, so they
 * are deliberately NOT React state: the scroll driver writes into this plain object
 * and the render loop (useFrame) reads from it. No re-render is ever triggered.
 */

export const worldState = {
  /** Target position along the camera path, 0..1, derived from page scroll. */
  target: 0,
  /** Progress through the journey section, 0..1 (drives gate highlighting). */
  journey: 0,
  /** Pointer position normalised to -1..1 on both axes. */
  pointerX: 0,
  pointerY: 0,
};

export type StageId = "hero" | "domains" | "journey" | "certificate" | "cta";

export const STAGE_ORDER: readonly StageId[] = [
  "hero",
  "domains",
  "journey",
  "certificate",
  "cta",
] as const;

/**
 * Which slice of the camera path each page section owns. Sections are measured from
 * the DOM at runtime, so editing copy or section heights never breaks the flight:
 * every pixel of scroll maps to a position on the path.
 */
export const STAGE_RANGES: Record<StageId, readonly [number, number]> = {
  hero: [0, 0.15],
  domains: [0.15, 0.4],
  journey: [0.4, 0.86],
  certificate: [0.86, 0.96],
  cta: [0.96, 1],
};

export const JOURNEY_STEP_COUNT = 6;

/**
 * The journey section is 7 viewport-heights tall: 6 are pinned (one per step) and
 * the last scrolls away. Gate i therefore sits at (i + 0.5) / 7 of the section.
 */
export const JOURNEY_SLOTS = JOURNEY_STEP_COUNT + 1;

export function gateT(index: number): number {
  const [from, to] = STAGE_RANGES.journey;
  return from + (to - from) * ((index + 0.5) / JOURNEY_SLOTS);
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export interface ScrollMapping {
  /** Position on the camera path, 0..1. */
  t: number;
  /** Progress within the journey section, 0..1 (0 when the stage is not reached). */
  journey: number;
}

/**
 * Pure mapping from scroll offset to camera-path position.
 *
 * `tops` holds each stage's document offset in STAGE_ORDER order (NaN when a stage
 * is missing from the page). A stage owns the scroll range from its top to the next
 * stage's top; the last stage runs to `maxScroll`.
 */
export function mapScrollToPath(
  scrollY: number,
  tops: readonly number[],
  maxScroll: number,
): ScrollMapping {
  let t = 0;
  let journey = 0;

  for (let i = 0; i < STAGE_ORDER.length; i += 1) {
    const id = STAGE_ORDER[i] as StageId;
    const start = i === 0 ? 0 : (tops[i] as number);
    if (Number.isNaN(start)) continue;
    if (scrollY < start && i !== 0) break;

    let end = maxScroll;
    for (let j = i + 1; j < STAGE_ORDER.length; j += 1) {
      const next = tops[j] as number;
      if (!Number.isNaN(next)) {
        end = next;
        break;
      }
    }

    const local = clamp01((scrollY - start) / Math.max(1, end - start));
    const [from, to] = STAGE_RANGES[id];
    t = from + (to - from) * local;
    journey = id === "journey" ? local : id === "hero" || id === "domains" ? 0 : 1;
  }

  return { t: clamp01(t), journey };
}
