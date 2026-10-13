import type { Metadata } from "next";

import { PageHero } from "@/components/layout/page-hero";
import { Reveal } from "@/components/motion/reveal";
import { Badge } from "@/components/ui/badge";
import { getPrisma } from "@/lib/db/prisma";

export const revalidate = 600;
export const metadata: Metadata = { title: "Projects", description: "Real projects students build during their internship.", alternates: { canonical: "/projects" } };

async function load() {
  try {
    return await getPrisma().project.findMany({ where: { status: "PUBLISHED", program: { status: "PUBLISHED" } }, orderBy: [{ programId: "asc" }, { sortOrder: "asc" }], select: { id: true, title: true, description: true, skills: true, program: { select: { title: true, domain: { select: { name: true } } } } } });
  } catch { return []; }
}

export default async function ProjectsPage() {
  const projects = await load();
  return (
    <>
      <PageHero title="Build something real." description="After finishing the tasks, you pick one project from your internship and build it in your own public GitHub repository." />
      <div className="container-page py-14">
        {projects.length === 0 ? <p className="text-muted-foreground">Projects will be listed here as internships are published.</p> : (
          <ul className="grid gap-5 md:grid-cols-2">{projects.map((p, i) => (
            <li key={p.id}><Reveal delay={(i % 2) * 0.08}><article className="h-full rounded-2xl border border-border bg-card p-6">
              <Badge variant="outline">{p.program.domain.name}</Badge><h2 className="mt-3 font-display text-xl font-semibold">{p.title}</h2>
              <p className="mt-2 line-clamp-4 text-sm text-muted-foreground">{p.description}</p><p className="mt-3 text-xs text-muted-foreground">Part of {p.program.title}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">{p.skills.slice(0, 5).map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}</div></article></Reveal></li>))}</ul>)}
      </div>
    </>
  );
}
