import Link from "next/link";

import { cn } from "@/lib/utils/cn";

export const PAGE_SIZES = [20, 50, 100] as const;

export function parsePaging(params: Record<string, string | string[] | undefined>) {
  const one = (k: string) => (Array.isArray(params[k]) ? params[k]?.[0] : params[k]) as string | undefined;
  const page = Math.max(1, Math.floor(Number(one("page")) || 1));
  const requested = Number(one("size"));
  const size = (PAGE_SIZES as readonly number[]).includes(requested) ? requested : 20;
  return { page, size, skip: (page - 1) * size, one };
}

function href(base: string, params: Record<string, string | undefined>, patch: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...patch })) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

/** Server-side pagination controls. The database does the paging; this only renders links. */
export function Pagination({ base, params, page, size, total }: { base: string; params: Record<string, string | undefined>; page: number; size: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / size));
  const link = "rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent";
  return (
    <nav aria-label="Pagination" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-muted-foreground">{total === 0 ? "No results" : `Showing ${(page - 1) * size + 1}-${Math.min(page * size, total)} of ${total}`}</p>
      <div className="flex items-center gap-2">
        {PAGE_SIZES.map((s) => (
          <Link key={s} href={href(base, params, { size: String(s), page: "1" })} className={cn("rounded-md px-2 py-1", s === size ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>{s}</Link>
        ))}
        <span className="mx-1 text-muted-foreground">per page</span>
        {page > 1 ? <Link href={href(base, params, { page: String(page - 1) })} className={link} rel="prev">Previous</Link> : null}
        {page < pages ? <Link href={href(base, params, { page: String(page + 1) })} className={link} rel="next">Next</Link> : null}
      </div>
    </nav>
  );
}
