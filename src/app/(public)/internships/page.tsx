import type { Metadata } from "next";
import Link from "next/link";

import { PageHero } from "@/components/layout/page-hero";
import { Reveal } from "@/components/motion/reveal";
import { SpotlightCard } from "@/components/motion/spotlight-card";
import { Badge } from "@/components/ui/badge";
import { getPrisma } from "@/lib/db/prisma";

export const revalidate = 600;
export const metadata: Metadata = {
  title: "Free online internships",
  description: "Browse free online engineering internships with structured tasks, a real project and an optional verified certificate.",
  alternates: { canonical: "/internships" },
};

async function load() {
  try {
    return await getPrisma().internshipProgram.findMany({
      where: { status: "PUBLISHED" }, orderBy: [{ isFeatured: "desc" }, { title: "asc" }],
      select: { id: true, slug: true, title: true, summary: true, durationLabel: true, mode: true, difficulty: true, skills: true, domain: { select: { name: true } } },
    });
  } catch {
    return [];
  }
}

export default async function InternshipsPage() {
  const programs = await load();
  return (
    <>
      <PageHero title="Free online internships." description="Choose a program, finish the tasks, build a project and get it verified. Joining never costs anything." />
      <div className="container-page py-14">
        {programs.length === 0 ? <p className="text-muted-foreground">New internships are being prepared. Check back soon.</p> : (
          <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {programs.map((p, i) => (
              <li key={p.id}><Reveal delay={(i % 3) * 0.08} className="h-full"><Link href={`/internships/${p.slug}`} className="block h-full rounded-2xl">
                <SpotlightCard tilt={4} className="flex h-full flex-col rounded-2xl border border-border bg-card p-6">
                  <div className="flex items-center justify-between"><Badge variant="outline">{p.domain.name}</Badge><Badge variant="success">Free</Badge></div>
                  <h2 className="mt-4 font-display text-xl font-semibold">{p.title}</h2>
                  <p className="mt-2 flex-1 text-sm text-muted-foreground">{p.summary}</p>
                  <p className="mt-4 text-xs text-muted-foreground">{p.durationLabel} · {p.mode} · {p.difficulty.toLowerCase()}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">{p.skills.slice(0, 4).map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}</div>
                  <span className="mt-5 text-sm font-medium text-primary">View internship →</span>
                </SpotlightCard></Link></Reveal></li>))}
          </ul>)}
      </div>
    </>
  );
}
