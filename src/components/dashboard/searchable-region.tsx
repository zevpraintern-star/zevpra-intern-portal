"use client";

import { Search } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Input } from "@/components/ui/input";

/** Adds quick, client-side filtering to a server-rendered list without fetching it again. */
export function SearchableRegion({ children, placeholder = "Search…", className = "" }: { children: ReactNode; placeholder?: string; className?: string }) {
  const region = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const needle = query.trim().toLocaleLowerCase();
    region.current?.querySelectorAll<HTMLElement>("[data-search-item]").forEach((item) => {
      item.hidden = Boolean(needle) && !item.textContent?.toLocaleLowerCase().includes(needle);
    });
  }, [query]);

  return (
    <div ref={region} className={className}>
      <label className="relative mb-6 block max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} className="pl-9" />
        <span className="sr-only">Search listed items</span>
      </label>
      {children}
    </div>
  );
}
