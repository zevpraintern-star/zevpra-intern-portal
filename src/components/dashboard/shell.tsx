"use client";

import { LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { Logo } from "@/components/layout/logo";
import { cn } from "@/lib/utils/cn";

export interface NavItem { key: string; label: string; href: string; badge?: number }

/**
 * Sidebar + mobile drawer shared by the student portal and the admin panel.
 * Navigation here is only convenience: every page and action re-checks authorisation on the server.
 */
export function DashboardShell({ nav, title, user, children, logoutHref, brand }: { nav: NavItem[]; title: string; user: string; children: ReactNode; logoutHref: string; brand: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push(logoutHref);
    router.refresh();
  }

  const links = (
    <nav aria-label={`${title} navigation`} className="flex flex-col gap-0.5">
      {nav.map((item) => {
        const active = pathname === item.href || (item.href.split("/").length > 3 && pathname.startsWith(item.href));
        return (
          <Link key={item.key} href={item.href} aria-current={active ? "page" : undefined}
            className={cn("flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors", active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
            {item.label}
            {item.badge ? <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{item.badge}</span> : null}
          </Link>
        );
      })}
      <button type="button" onClick={logout} className="mt-2 flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
        <LogOut className="size-4" aria-hidden="true" /> Log out
      </button>
    </nav>
  );

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[17rem_1fr]">
      <aside className="hidden border-r border-border bg-card/40 p-4 lg:sticky lg:top-0 lg:block lg:h-screen lg:overflow-y-auto">
        <Logo name={brand} />
        <p className="mt-6 px-3 text-xs text-muted-foreground">{title}</p>
        <p className="mb-3 truncate px-3 text-sm font-medium">{user}</p>
        {links}
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/90 px-4 py-3 backdrop-blur lg:hidden">
          <Logo name={brand} />
          <button type="button" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)} className="rounded-md p-2 hover:bg-accent"><Menu className="size-5" /></button>
        </header>
        {open ? (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-0 h-full w-72 overflow-y-auto bg-background p-4 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <p className="truncate text-sm font-medium">{user}</p>
                <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="rounded-md p-2 hover:bg-accent"><X className="size-5" /></button>
              </div>
              {links}
            </div>
          </div>
        ) : null}
        <main id="main-content" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
