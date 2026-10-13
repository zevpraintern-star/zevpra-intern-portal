/**
 * Lightweight stand-in for the 3D world: pure SVG and CSS, no JavaScript.
 *
 * It is what visitors see (a) while the 3D bundle loads, (b) when WebGL is
 * unavailable and (c) when they prefer reduced motion or switch effects off. It
 * keeps the same composition (globe on the right, glow behind) so nothing jumps
 * when the real scene fades in over it.
 */
export function StaticBackdrop() {
  // Round to a fixed precision before rendering. Math.cos/sin/sqrt can differ by
  // 1 ULP between the server's engine (Node) and the browser (V8), which otherwise
  // produces different string serialisations on server vs client and a hydration
  // mismatch. A handful of decimals is far beyond what an SVG at 70vmin can show.
  const round = (n: number) => Math.round(n * 1000) / 1000;

  const dots = Array.from({ length: 150 }, (_, i) => {
    const y = 1 - (i / 149) * 2;
    const ring = Math.sqrt(1 - y * y);
    const theta = i * Math.PI * (3 - Math.sqrt(5));
    return { x: Math.cos(theta) * ring, y, z: Math.sin(theta) * ring };
  }).filter((p) => p.z > -0.1);

  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(70%_55%_at_75%_30%,color-mix(in_oklch,var(--color-primary)_22%,transparent),transparent_70%),radial-gradient(50%_45%_at_15%_75%,color-mix(in_oklch,var(--brand-cyan)_16%,transparent),transparent_70%)]" />
      <svg
        viewBox="-110 -110 220 220"
        className="absolute right-[-12%] top-[6%] h-[70vmin] w-[70vmin] text-primary sm:right-[4%] sm:top-[12%] sm:h-[78vmin] sm:w-[78vmin]"
        fill="none"
      >
        <circle r="80" stroke="currentColor" strokeOpacity="0.35" />
        <ellipse rx="80" ry="28" stroke="currentColor" strokeOpacity="0.2" />
        <ellipse rx="28" ry="80" stroke="currentColor" strokeOpacity="0.2" />
        <ellipse rx="112" ry="38" transform="rotate(-24)" stroke="currentColor" strokeOpacity="0.25" />
        {dots.map((p, i) => (
          <circle
            key={i}
            cx={round(p.x * 80)}
            cy={round(p.y * 80)}
            r={1.1}
            fill="currentColor"
            fillOpacity={round(0.25 + p.z * 0.45)}
          />
        ))}
        <path
          d="M-48 30 Q-10 -70 52 -22"
          stroke="var(--brand-cyan)"
          strokeOpacity="0.7"
          strokeWidth="1"
        />
        <path
          d="M-30 -42 Q20 -80 58 18"
          stroke="var(--brand-cyan)"
          strokeOpacity="0.45"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}
