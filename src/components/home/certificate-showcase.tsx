"use client";

import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { Reveal } from "@/components/motion/reveal";
import { SpotlightCard } from "@/components/motion/spotlight-card";

/**
 * Decorative stand-in for a QR code: three finder squares plus a deterministic
 * module pattern. It is clearly labelled as a sample and encodes nothing.
 */
function SampleQr() {
  const size = 21;
  const cells: ReactNode[] = [];
  const inFinder = (x: number, y: number) =>
    (x < 8 && y < 8) || (x > size - 9 && y < 8) || (x < 8 && y > size - 9);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (inFinder(x, y)) continue;
      if (((x * 7 + y * 13 + x * y) % 5) % 2 === 0 && (x + y) % 3 !== 0) {
        cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />);
      }
    }
  }

  const finder = (ox: number, oy: number) => (
    <g key={`${ox}-${oy}`} transform={`translate(${ox} ${oy})`}>
      <rect width="7" height="7" />
      <rect x="1" y="1" width="5" height="5" fill="#0c1230" />
      <rect x="2" y="2" width="3" height="3" />
    </g>
  );

  return (
    <svg viewBox={`-1 -1 ${size + 2} ${size + 2}`} className="size-full" fill="#f5f1e6" aria-hidden="true">
      {finder(0, 0)}
      {finder(size - 7, 0)}
      {finder(0, size - 7)}
      {cells}
    </svg>
  );
}

function SampleCertificate({ companyName, domain }: { companyName: string; domain: string }) {
  return (
    <SpotlightCard
      tilt={11}
      className="float-card aspect-[1.45/1] w-full max-w-xl overflow-hidden rounded-2xl border border-[#caa45a]/60 bg-[linear-gradient(135deg,#0c1230_0%,#171f4d_55%,#0c1230_100%)] p-5 text-[#f5f1e6] shadow-[0_40px_90px_-30px_rgba(106,76,255,0.65)] sm:p-8"
    >
      <div className="pointer-events-none absolute inset-2 rounded-xl border border-[#caa45a]/30" />
      <div
        className="pointer-events-none absolute -right-8 top-6 rotate-12 rounded border border-[#ffb547]/70 px-8 py-1 text-[0.65rem] tracking-widest text-[#ffb547] sm:text-xs"
        style={{ transform: "translateZ(40px) rotate(12deg)" }}
      >
        SAMPLE
      </div>

      <div className="relative flex h-full flex-col justify-between" style={{ transform: "translateZ(30px)" }}>
        <div>
          <p className="font-display text-sm font-semibold sm:text-lg">{companyName}</p>
          <p className="mt-1 text-[0.65rem] text-[#f5f1e6]/60 sm:text-xs">Certificate of completion</p>
        </div>

        <div className="text-center">
          <p className="text-[0.65rem] text-[#f5f1e6]/60 sm:text-xs">This certifies that</p>
          <p className="font-display text-2xl font-semibold text-[#ffd98a] sm:text-4xl">
            Sample Student
          </p>
          <p className="mt-1 text-[0.65rem] text-[#f5f1e6]/60 sm:text-xs">
            has completed the online internship
          </p>
          <p className="font-display mt-1 text-base font-medium sm:text-xl">
            Python Development Internship
          </p>
          <p className="mt-1 text-[0.65rem] text-[#f5f1e6]/60 sm:text-xs">Online · 8 weeks</p>
        </div>

        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0 text-[0.6rem] leading-relaxed text-[#f5f1e6]/65 sm:text-xs">
            <p>Certificate ID: CERT-SAMPLE</p>
            <p className="truncate">{domain}/verify-certificate/…</p>
          </div>
          <div className="size-14 shrink-0 rounded-md bg-[#0c1230] p-1 ring-1 ring-[#caa45a]/50 sm:size-20">
            <SampleQr />
          </div>
        </div>
      </div>
    </SpotlightCard>
  );
}

const FACTS = [
  "Every certificate has a public verification page and a QR code.",
  "The page shows only the name, internship, domain and issue date. Contact and payment details stay private.",
  "A certificate can be revoked, and the verification page will say so.",
  "It confirms completion of our own program. It is not a government or university credential.",
] as const;

export function CertificateShowcase({
  companyName,
  domain,
  fee,
}: {
  companyName: string;
  domain: string;
  fee: string;
}) {
  return (
    <section aria-labelledby="certificate-heading" className="relative py-[14vh]">
      <div className="container-page grid items-center gap-12 lg:grid-cols-[1fr_1.15fr]">
        <Reveal className="world-panel rounded-2xl p-6 sm:p-9">
          <h2
            id="certificate-heading"
            className="font-display text-4xl font-semibold leading-[1.02] sm:text-6xl"
          >
            A certificate anyone can check.
          </h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
            Finish the internship for free. If you want a certificate, it costs {fee}, paid by UPI
            and verified by a person before it is issued.
          </p>
          <ul className="mt-8 space-y-3">
            {FACTS.map((fact) => (
              <li key={fact} className="flex gap-3 text-sm leading-relaxed sm:text-base">
                <Check className="mt-1 size-4 shrink-0 text-[var(--brand-cyan)]" aria-hidden="true" />
                <span className="text-muted-foreground">{fact}</span>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={0.15} className="flex justify-center lg:justify-end">
          <SampleCertificate companyName={companyName} domain={domain} />
        </Reveal>
      </div>
    </section>
  );
}
