# Frontend structure: 3D world and motion

```
src/components/
  3d/            WebGL world (loaded lazily, never in the initial bundle)
    world-canvas.tsx     entry: capability check, fallback, effects toggle
    world-scene.tsx      <Canvas> and scene composition
    camera-rig.tsx       flies the camera along the path from scroll
    path.ts              the flight path (CatmullRom spline)
    world-state.ts       scroll -> path mapping (pure, unit tested), stage ranges
    use-scroll-driver.ts writes scroll/pointer into world-state (no React renders)
    use-world-mode.ts    full | lite | static, reduced-motion, user preference
    globe / constellation / gates / portal / starfield / floaters   scene pieces
    palette.ts           dark and light colour sets
    static-backdrop.tsx  SVG fallback (no JS, no WebGL)
  motion/        reusable animation primitives
    reveal, split-lines, magnetic, spotlight-card, marquee, smooth-scroll, scroll-progress
  home/          homepage sections (hero, domain-panels, journey, certificate-showcase, ...)
  layout/        header, footer, page-hero
src/lib/content/journey.ts   the six steps: one source for home, /how-it-works and screen readers
src/server/queries/domains.ts  DB-driven domain catalogue with time-boxed fallback
```

## How the flight works
Each homepage section carries `data-stage="hero|domains|journey|certificate|cta"`.
`mapScrollToPath` measures those sections and maps every pixel of scroll to a position
on the camera path (`STAGE_RANGES` in world-state.ts). Change copy or heights freely;
the flight re-measures itself. The journey section is 7 viewport-heights tall (6 pinned
steps + exit), so gate N always lines up with step N.

## Tuning
- Path: `path.ts`. Colours: `palette.ts` (keep `--domain-1..4` in globals.css in sync).
- Quality: particle counts and sizes in each scene file take a `lite` flag.
- Visitors can switch Full / Lite / Off with the button at the bottom right
  (stored in localStorage key `ip_fx`; non-sensitive).
