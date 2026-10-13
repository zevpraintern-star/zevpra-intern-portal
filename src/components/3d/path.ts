import { CatmullRomCurve3, Vector3 } from "three";

/**
 * The flight path. The globe sits near the origin; the camera swings past it, flies
 * through four domain constellations, threads six journey gates and emerges through
 * the certificate portal. Points are in world units; z decreases as we travel.
 */
const POINTS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0.6, 10],
  [-0.6, 1.0, 5.5],
  [-3.2, 0.6, -1],
  [-2.0, 0.8, -14],
  [0.5, 0.0, -26],
  [0, -0.4, -40],
  [1.5, 0.5, -54],
  [-1.5, 0, -66],
  [2.5, -0.8, -84],
  [-2.5, 0.8, -104],
  [2.0, -0.4, -124],
  [-1.5, 0.4, -144],
  [0, 0, -160],
  [0, 0.5, -176],
  [0, 0.2, -196],
];

let cached: CatmullRomCurve3 | null = null;

export function getPathCurve(): CatmullRomCurve3 {
  if (!cached) {
    cached = new CatmullRomCurve3(
      POINTS.map(([x, y, z]) => new Vector3(x, y, z)),
      false,
      "centripetal",
    );
    cached.arcLengthDivisions = 1500;
  }
  return cached;
}

/** Deterministic RNG so the scene is identical on every load (no flicker on re-mount). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
