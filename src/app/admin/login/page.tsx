import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { getBranding } from "@/lib/config/branding";

import { AdminLoginForm } from "./login-form";

export const metadata: Metadata = { title: "Admin sign in", robots: { index: false, follow: false } };

/**
 * Staff sign-in screen.
 *
 * Deliberately stands alone (no public header/footer chrome) but keeps the site's
 * visual language: branded wordmark, theme toggle, ambient brand-colour backdrop
 * and the shared card/input/button components. Step transitions live in the
 * client form so keyboard focus and the honeypot stay intact.
 */
export default function AdminLoginPage() {
  const branding = getBranding();
  return (
    <main id="main-content" className="relative flex min-h-dvh flex-col overflow-hidden bg-background px-4 py-8">
      {/* Ambient backdrop: soft brand-colour orbs under a fading grid. Decorative only. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -left-40 size-[26rem] rounded-full bg-[var(--brand-violet)] opacity-20 blur-3xl" />
        <div className="absolute -right-52 top-1/3 size-[30rem] rounded-full bg-[var(--brand-cyan)] opacity-15 blur-3xl" />
        <div className="absolute -bottom-48 left-1/4 size-[22rem] rounded-full bg-[var(--brand-amber)] opacity-10 blur-3xl" />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
            backgroundSize: "3rem 3rem",
            maskImage: "radial-gradient(ellipse 70% 60% at 50% 0%, black 35%, transparent 100%)",
            WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 0%, black 35%, transparent 100%)",
            opacity: 0.5,
          }}
        />
      </div>

      <header className="relative z-10 flex items-center justify-between gap-4">
        <Logo name={branding.companyShortName} href="/" />
        <ThemeToggle />
      </header>

      <div className="relative z-10 flex flex-1 items-center justify-center py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex flex-col items-center text-center">
            <span className="mb-4 inline-flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
              <ShieldCheck className="size-6" aria-hidden="true" />
            </span>
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Admin sign in</h1>
            <p className="mt-2 text-balance text-sm text-muted-foreground">Staff only. You'll confirm with a code sent to your email.</p>
          </div>
          <AdminLoginForm />
        </div>
      </div>

      <footer className="relative z-10 flex flex-col items-center justify-between gap-2 text-center text-sm text-muted-foreground sm:flex-row">
        <Link href="/" className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground">
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to site
        </Link>
        <p>
          Not staff?{" "}
          <Link href="/login" className="font-medium text-primary transition-colors hover:underline">
            Student sign in
          </Link>
        </p>
      </footer>
    </main>
  );
}
