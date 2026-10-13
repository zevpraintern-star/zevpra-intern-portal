import Link from "next/link";

import { Reveal } from "@/components/motion/reveal";
import type { DomainGroup } from "@/server/queries/domains";
import { cn } from "@/lib/utils/cn";

const MAX_CHIPS = 9;

/**
 * Four panels, one per 3D constellation. A panel's coloured dot matches the cluster
 * the camera is passing, and panels alternate sides so the cluster is always on the
 * opposite side of the screen from the text.
 */
export function DomainPanels({ groups }: { groups: DomainGroup[] }) {
  const panels = groups.slice(0, 4);

  return (
    <section data-stage="domains" aria-labelledby="domains-heading" className="relative">
      <div className="container-page pb-[4vh] pt-[16vh]">
        <Reveal className="max-w-2xl">
          <h2
            id="domains-heading"
            className="font-display text-4xl font-semibold leading-[1.02] sm:text-6xl"
          >
            Every branch of engineering has a path here.
          </h2>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
            Domains are managed from the admin panel, so new ones appear here as soon as they are
            added.
          </p>
        </Reveal>
      </div>

      {panels.map((group, index) => {
        const extra = Math.max(0, group.domains.length - MAX_CHIPS);
        return (
          <div
            key={group.slug}
            className={cn(
              "container-page flex min-h-[78svh] items-center",
              index % 2 === 0 ? "justify-start" : "justify-end",
            )}
          >
            <Reveal className="world-panel w-full max-w-md rounded-2xl p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="size-3 rounded-full shadow-[0_0_14px_2px] shadow-current"
                  style={{
                    backgroundColor: `var(--domain-${index + 1})`,
                    color: `var(--domain-${index + 1})`,
                  }}
                />
                <h3 className="font-display text-2xl font-semibold sm:text-3xl">{group.name}</h3>
              </div>
              {group.description ? (
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                  {group.description}
                </p>
              ) : null}

              {group.domains.length > 0 ? (
                <ul className="mt-5 flex flex-wrap gap-2">
                  {group.domains.slice(0, MAX_CHIPS).map((domain) => (
                    <li
                      key={domain.slug}
                      className="rounded-full border border-border bg-background/50 px-3 py-1 text-xs"
                    >
                      {domain.name}
                    </li>
                  ))}
                  {extra > 0 ? (
                    <li className="rounded-full px-3 py-1 text-xs text-muted-foreground">
                      +{extra} more
                    </li>
                  ) : null}
                </ul>
              ) : null}

              <Link
                href={`/domains#${group.slug}`}
                className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Explore {group.name}
              </Link>
            </Reveal>
          </div>
        );
      })}
    </section>
  );
}
