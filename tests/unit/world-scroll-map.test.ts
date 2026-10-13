import { describe, expect, it } from "vitest";

import {
  gateT,
  mapScrollToPath,
  STAGE_RANGES,
} from "@/components/3d/world-state";

// hero 0-1000, domains 1000-3000, journey 3000-7000, certificate 7000-8000, cta 8000-9000
const TOPS = [0, 1000, 3000, 7000, 8000];
const MAX = 9000;

describe("mapScrollToPath", () => {
  it("starts at the beginning of the path", () => {
    expect(mapScrollToPath(0, TOPS, MAX).t).toBe(0);
  });

  it("reaches the end of the path at the bottom of the page", () => {
    expect(mapScrollToPath(MAX, TOPS, MAX).t).toBeCloseTo(1, 5);
  });

  it("is monotonic non-decreasing across the whole page", () => {
    let previous = -1;
    for (let y = 0; y <= MAX; y += 25) {
      const { t } = mapScrollToPath(y, TOPS, MAX);
      expect(t).toBeGreaterThanOrEqual(previous);
      previous = t;
    }
  });

  it("places each stage boundary on the configured path value", () => {
    expect(mapScrollToPath(1000, TOPS, MAX).t).toBeCloseTo(STAGE_RANGES.domains[0], 5);
    expect(mapScrollToPath(3000, TOPS, MAX).t).toBeCloseTo(STAGE_RANGES.journey[0], 5);
    expect(mapScrollToPath(7000, TOPS, MAX).t).toBeCloseTo(STAGE_RANGES.certificate[0], 5);
  });

  it("reports journey progress only inside the journey stage", () => {
    expect(mapScrollToPath(500, TOPS, MAX).journey).toBe(0);
    expect(mapScrollToPath(5000, TOPS, MAX).journey).toBeCloseTo(0.5, 5);
    expect(mapScrollToPath(8500, TOPS, MAX).journey).toBe(1);
  });

  it("survives a missing stage without producing NaN", () => {
    const { t } = mapScrollToPath(4000, [0, 1000, Number.NaN, 7000, 8000], MAX);
    expect(Number.isFinite(t)).toBe(true);
  });
});

describe("gateT", () => {
  it("keeps every gate inside the journey range, in order", () => {
    const [from, to] = STAGE_RANGES.journey;
    let previous = from;
    for (let i = 0; i < 6; i += 1) {
      const value = gateT(i);
      expect(value).toBeGreaterThan(previous);
      expect(value).toBeLessThan(to);
      previous = value;
    }
  });
});
