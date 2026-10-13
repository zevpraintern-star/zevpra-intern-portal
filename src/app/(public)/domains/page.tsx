import type { Metadata } from "next";
import Link from "next/link";

import { PageHero } from "@/components/layout/page-hero";
import { Reveal } from "@/components/motion/reveal";
import { SpotlightCard } from "@/components/motion/spotlight-card";
import { getDomainGroups } from "@/server/queries/domains";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Internship domains",
  description: "Engineering domains you can intern in: computer science, electronics, mechanical and civil.",
  alternates: { canonical: "/domains" },
};

export default async function DomainsPage() {
  const groups = await getDomainGroups();

  return (
    <>
      <PageHero
        title="Pick the domain that fits your branch."
        description="Each domain has its own tasks and projects. The list is managed by administrators, so it always reflects what is currently open."
      />

      <div className="container-page space-y-20 py-16 sm:py-24">
        {groups.map((group, groupIndex) => (
          <section
            key={group.slug}
            id={group.slug}
            aria-labelledby={`${group.slug}-heading`}
            className="scroll-mt-24"
          >
            <Reveal>
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="size-3 rounded-full"
                  style={{ backgroundColor: `var(--domain-${(groupIndex % 4) + 1})` }}
                />
                <h2
                  id={`${group.slug}-heading`}
                  className="font-display text-3xl font-semibold sm:text-4xl"
                >
                  {group.name}
                </h2>
              </div>
              {group.description ? (
                <p className="mt-3 max-w-2xl text-muted-foreground">{group.description}</p>
              ) : null}
            </Reveal>

            {group.domains.length > 0 ? (
              <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.domains.map((domain) => (
                  <li key={domain.slug}>
                    <Link href="/internships" className="group block rounded-xl">
                      <SpotlightCard
                        tilt={5}
                        className="rounded-xl border border-border bg-card p-5 transition-colors group-hover:border-primary/50"
                      >
                        <h3 className="font-display text-lg font-semibold">{domain.name}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">View internships</p>
                      </SpotlightCard>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-6 text-sm text-muted-foreground">
                Domains in this category will appear here once they are published.
              </p>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
