import Link from "next/link";

import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { getBranding } from "@/lib/config/branding";

/**
 * 404 page. Renders inside the root layout, so it ships its own minimal chrome and
 * never leaks internal detail about what does or does not exist.
 */
export default function NotFound() {
  const branding = getBranding();

  return (
    <div className="container-page flex min-h-dvh flex-col items-center justify-center gap-6 py-20 text-center">
      <Logo name={branding.companyShortName} />

      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Page not found</h1>
      <p className="max-w-md text-muted-foreground">
        The page you are looking for may have moved or may never have existed. Use the links below
        to continue.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link href="/">Back to home</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/internships">Browse internships</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/contact">Contact support</Link>
        </Button>
      </div>
    </div>
  );
}
