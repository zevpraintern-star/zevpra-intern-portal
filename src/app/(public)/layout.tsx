import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

/**
 * Public website shell.
 *
 * Route group, so URLs stay at the root (/about, /internships, ...). The student
 * portal and admin panel live outside this group and provide their own chrome.
 *
 * Phase 2 will resolve the session here and pass `isAuthenticated` so the header
 * can show "Dashboard" instead of "Login" for signed-in students.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
