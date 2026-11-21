import type { Metadata } from "next";

import { PageHero } from "@/components/layout/page-hero";
import { Reveal } from "@/components/motion/reveal";
import { SearchableRegion } from "@/components/dashboard/searchable-region";
import { Badge } from "@/components/ui/badge";
import { getPrisma } from "@/lib/db/prisma";
import { projectDurationLabel } from "@/lib/difficulty";

export const revalidate = 600;
export const metadata: Metadata = { title: "Projects", description: "Real projects students build during their internship.", alternates: { canonical: "/projects" } };

async function load() {
  try {
    return await getPrisma().project.findMany({
      where: { status: "PUBLISHED", program: { status: "PUBLISHED" } },
      orderBy: [{ programId: "asc" }, { sortOrder: "asc" }],
      select: { id: true, title: true, description: true, skills: true, difficulty: true, program: { select: { title: true, domain: { select: { name: true } } } } },
    });
  } catch {
    return [];
  }
}

export default async function ProjectsPage() {
  const projects = await load();
  const domainMap = new Map<string, typeof projects>();
  for (const project of projects) {
    const domain = project.program.domain.name;
    const existing = domainMap.get(domain) ?? [];
    existing.push(project);
    domainMap.set(domain, existing);
  }
  const groups = [...domainMap.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <>
      <PageHero title="Build something real." description="After finishing the tasks, you pick one project from your internship and build it in your own public GitHub repository." />
      <SearchableRegion
        className="container-page py-14"
        placeholder="Search projects, skills, or domains..."
        ariaLabel="Search projects, skills, or domains"
      >
        {projects.length === 0 ? (
          <p className="text-muted-foreground">Projects will be listed here as internships are published.</p>
        ) : (
          <div className="space-y-14">
            {groups.map(([domain, domainProjects], groupIndex) => (
              <section key={domain} data-search-group aria-labelledby={`project-domain-${groupIndex}`}>
                <div className="mb-6 flex items-center gap-3">
                  <span aria-hidden="true" className="size-3 rounded-full" style={{ backgroundColor: `var(--domain-${(groupIndex % 4) + 1})` }} />
                  <h2 id={`project-domain-${groupIndex}`} className="font-display text-2xl font-semibold sm:text-3xl">{domain}</h2>
                  <Badge variant="secondary">{domainProjects.length} {domainProjects.length === 1 ? "project" : "projects"}</Badge>
                </div>
                <ul className="grid gap-5 md:grid-cols-2">
                  {domainProjects.map((project, index) => (
                    <li key={project.id} data-search-item>
                      <Reveal delay={(index % 2) * 0.08}>
                        <article className="h-full rounded-2xl border border-border bg-card p-6">
                          <Badge variant="outline">{project.program.domain.name}</Badge>
                          <h3 className="mt-3 font-display text-xl font-semibold">{project.title}</h3>
                          <p className="mt-2 line-clamp-4 text-sm text-muted-foreground">{project.description}</p>
                          <p className="mt-3 text-xs text-muted-foreground">Part of {project.program.title} · Estimated time: {projectDurationLabel(project.difficulty)}</p>
                          <div className="mt-3 flex flex-wrap gap-1.5">{project.skills.slice(0, 5).map((skill) => <Badge key={skill} variant="secondary">{skill}</Badge>)}</div>
                        </article>
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
