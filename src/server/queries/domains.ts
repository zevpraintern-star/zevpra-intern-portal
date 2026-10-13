import { getPrisma } from "@/lib/db/prisma";

export interface DomainGroup {
  slug: string;
  name: string;
  description: string | null;
  domains: Array<{ slug: string; name: string }>;
}

/**
 * Public domain catalogue, grouped by category.
 *
 * Domains are database driven (admins add and edit them without a deploy), so this
 * is the only source for domain names on public pages. If the database is
 * unreachable (first local run, outage) the pages still render using the category
 * fallback below instead of failing, and the call is time-boxed so a slow database
 * can never stall a page render or build.
 */

const QUERY_TIMEOUT_MS = 2500;

/** Category-level resilience fallback only. It contains no individual domains. */
const FALLBACK_GROUPS: DomainGroup[] = [
  {
    slug: "computer-science",
    name: "Computer Science",
    description: "Software, security, cloud, data and AI.",
    domains: [],
  },
  {
    slug: "electronics",
    name: "Electronics",
    description: "Embedded, VLSI, control and power systems.",
    domains: [],
  },
  {
    slug: "mechanical",
    name: "Mechanical",
    description: "Design, manufacturing and automotive engineering.",
    domains: [],
  },
  {
    slug: "civil",
    name: "Civil",
    description: "Structures, construction and environmental engineering.",
    domains: [],
  },
];

async function queryGroups(): Promise<DomainGroup[]> {
  const rows = await getPrisma().domainCategory.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      slug: true,
      name: true,
      description: true,
      domains: {
        where: { isActive: true },
        orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }],
        select: { slug: true, name: true },
      },
    },
  });
  return rows;
}

export async function getDomainGroups(): Promise<DomainGroup[]> {
  try {
    const rows = await Promise.race([
      queryGroups(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("domain query timed out")), QUERY_TIMEOUT_MS),
      ),
    ]);
    return rows.length > 0 ? rows : FALLBACK_GROUPS;
  } catch {
    return FALLBACK_GROUPS;
  }
}
