import type { Metadata } from "next";
import Link from "next/link";

import { SearchableRegion } from "@/components/dashboard/searchable-region";
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
  const domainMap = new Map<string, typeof programs>();
  for (const program of programs) {
    const existing = domainMap.get(program.domain.name) ?? [];
    existing.push(program);
    domainMap.set(program.domain.name, existing);
  }
  const groups = [...domainMap.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <>
      <PageHero title="Free online internships." description="Choose a program, finish the tasks, build a project and get it verified. Joining never costs anything." />
      <SearchableRegion
        className="container-page py-14"
        placeholder="Search internships, domains, or skills..."
        ariaLabel="Search internships, domains, or skills"
      >
        {programs.length === 0 ? (
          <p className="text-muted-foreground">New internships are being prepared. Check back soon.</p>
        ) : (
          <div className="space-y-14">
            {groups.map(([domain, domainPrograms], groupIndex) => (
              <section key={domain} data-search-group aria-labelledby={`internship-domain-${groupIndex}`}>
                <div className="mb-6 flex items-center gap-3">
                  <span aria-hidden="true" className="size-3 rounded-full" style={{ backgroundColor: `var(--domain-${(groupIndex % 4) + 1})` }} />
                  <h2 id={`internship-domain-${groupIndex}`} className="font-display text-2xl font-semibold sm:text-3xl">{domain}</h2>
                  <Badge variant="secondary">{domainPrograms.length} {domainPrograms.length === 1 ? "internship" : "internships"}</Badge>
                </div>
                <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                  {domainPrograms.map((program, index) => (
                    <li key={program.id} data-search-item>
                      <Reveal delay={(index % 3) * 0.08} className="h-full">
                        <Link href={`/internships/${program.slug}`} className="block h-full rounded-2xl">
                          <SpotlightCard tilt={4} className="flex h-full flex-col rounded-2xl border border-border bg-card p-6">
                            <div className="flex items-center justify-between"><Badge variant="outline">{program.domain.name}</Badge><Badge variant="success">Free</Badge></div>
                            <h3 className="mt-4 font-display text-xl font-semibold">{program.title}</h3>
                            <p className="mt-2 flex-1 text-sm text-muted-foreground">{program.summary}</p>
                            <p className="mt-4 text-xs text-muted-foreground">{program.durationLabel} · {program.mode} · {program.difficulty.toLowerCase()}</p>
                            <div className="mt-3 flex flex-wrap gap-1.5">{program.skills.slice(0, 4).map((skill) => <Badge key={skill} variant="secondary">{skill}</Badge>)}</div>
                            <span className="mt-5 text-sm font-medium text-primary">View internship →</span>
                          </SpotlightCard>
                        </Link>
                      </Reveal>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </SearchableRegion>
    </>
  );
}
