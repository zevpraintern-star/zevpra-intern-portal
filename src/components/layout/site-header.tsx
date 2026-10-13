import Link from "next/link";

import { HeaderShell } from "@/components/layout/header-shell";
import { Logo } from "@/components/layout/logo";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { getBranding } from "@/lib/config/branding";
import { PUBLIC_NAV } from "@/lib/config/constants";

/**
 * Public site header. Server component: branding and navigation come from
 * server-side configuration, while the interactive pieces (mobile menu, theme
 * switch) are isolated client components.
 *
 * Admin routes are intentionally absent from the public navigation.
 */
export function SiteHeader({ isAuthenticated = false }: { isAuthenticated?: boolean }) {
  const branding = getBranding();

  return (
    <HeaderShell>
      <a
        href="#main-content"
        className="sr-only-focusable absolute left-4 top-3 z-50 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
      >
        Skip to content
      </a>

      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Logo name={branding.companyShortName} />

        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {PUBLIC_NAV.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className="relative rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground after:absolute after:inset-x-3 after:bottom-1 after:h-px after:origin-left after:scale-x-0 after:bg-[var(--brand-cyan)] after:transition-transform after:duration-300 hover:after:scale-x-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle className="hidden sm:inline-flex" />

          <div className="hidden items-center gap-2 lg:flex">
            {isAuthenticated ? (
              <Button asChild size="sm">
                <Link href="/student/dashboard">Dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">Login</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/register">Register Free</Link>
                </Button>
              </>
            )}
          </div>

          <MobileNav items={PUBLIC_NAV} isAuthenticated={isAuthenticated} />
        </div>
      </div>
    </HeaderShell>
  );
}
