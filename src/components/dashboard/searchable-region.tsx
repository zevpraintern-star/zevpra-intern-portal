"use client";

import { Search } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Input } from "@/components/ui/input";

/** Adds quick, client-side filtering to server-rendered lists without refetching. */
export function SearchableRegion({
  children,
  placeholder = "Search...",
  className = "",
  ariaLabel = "Search listed items",
}: {
  children: ReactNode;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const region = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const needle = query.trim().toLocaleLowerCase();
    const root = region.current;
    if (!root) return;

    root.querySelectorAll<HTMLElement>("[data-search-item]").forEach((item) => {
      item.hidden = Boolean(needle) && !item.textContent?.toLocaleLowerCase().includes(needle);
    });
    root.querySelectorAll<HTMLElement>("[data-search-group]").forEach((group) => {
      const items = [...group.querySelectorAll<HTMLElement>("[data-search-item]")];
      group.hidden = Boolean(needle) && items.length > 0 && items.every((item) => item.hidden);
    });
  }, [query]);

  return (
    <div ref={region} className={className}>
      <label className="relative mb-6 block max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} className="pl-9" />
        <span className="sr-only">{ariaLabel}</span>
      </label>
      {children}
    </div>
  );
}
