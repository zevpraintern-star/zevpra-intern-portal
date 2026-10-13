"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export interface NavItem {
  key: string;
  label: string;
  href: string;
}

/**
 * Mobile hamburger navigation.
 *
 * Accessibility: the trigger exposes aria-expanded/aria-controls, Escape closes the
 * panel, body scroll is locked while open, and the panel is removed from the tab
 * order when closed (no hidden-but-focusable links).
 */
export function MobileNav({
  items,
  isAuthenticated,
}: {
  items: readonly NavItem[];
  isAuthenticated: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <Button
        variant="ghost"
        size="icon"
        aria-expanded={open}
        aria-controls="mobile-navigation"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
      </Button>

      {open ? (
        <div
          id="mobile-navigation"
          className="fixed inset-x-0 top-16 z-40 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-border bg-background p-4 shadow-lg"
        >
          <nav aria-label="Mobile" className="flex flex-col gap-1">
            {items.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className={cn("mt-4 flex flex-col gap-2 border-t border-border pt-4")}>
            {isAuthenticated ? (
              <Button asChild>
                <Link href="/student/dashboard" onClick={() => setOpen(false)}>
                  Go to dashboard
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="outline">
                  <Link href="/login" onClick={() => setOpen(false)}>
                    Login
                  </Link>
                </Button>
                <Button asChild>
                  <Link href="/register" onClick={() => setOpen(false)}>
                    Register Free
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
