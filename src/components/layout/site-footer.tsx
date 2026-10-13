import Link from "next/link";

import { Logo } from "@/components/layout/logo";
import { getBranding } from "@/lib/config/branding";
import { FOOTER_NAV } from "@/lib/config/constants";

/**
 * Public site footer.
 *
 * Contains only factual statements. No accreditation, placement or partnership
 * claims appear here, matching the "no fake claims" requirement: if a claim is not
 * verifiable it cannot be printed on the website.
 */
export function SiteFooter() {
  const branding = getBranding();
  const socialLinks = Object.entries(branding.socialLinks).filter(([, url]) => Boolean(url));

  return (
    <footer className="relative z-10 border-t border-border bg-background">
      <div className="container-page grid gap-10 py-12 md:grid-cols-4">
        <div className="space-y-3">
          <Logo name={branding.companyShortName} />
          <p className="text-sm text-muted-foreground">
            Free online internships for engineering students, delivered through structured tasks,
            project work and mentor-reviewed submissions.
          </p>
          <p className="text-sm text-muted-foreground">
            Support:{" "}
            <a className="underline underline-offset-4" href={`mailto:${branding.supportEmail}`}>
              {branding.supportEmail}
            </a>
          </p>
          {socialLinks.length > 0 ? (
            <ul className="flex flex-wrap gap-3 text-sm">
              {socialLinks.map(([key, url]) => (
                <li key={key}>
                  <a
                    href={url}
                    rel="noopener noreferrer nofollow"
                    target="_blank"
                    className="underline underline-offset-4"
                  >
                    {key}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <FooterColumn title="Platform" links={FOOTER_NAV.platform} />
        <FooterColumn title="Company" links={FOOTER_NAV.company} />
        <FooterColumn title="Legal" links={FOOTER_NAV.legal} />
      </div>

      <div className="border-t border-border">
        <div className="container-page flex flex-col gap-2 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {new Date().getFullYear()} {branding.companyName}. All rights reserved.
          </p>
          <p>
            Certificates confirm completion of our own internship programs. We do not claim
            government, university, UGC or AICTE approval.
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: ReadonlyArray<{ label: string; href: string }>;
}) {
  return (
    <nav aria-label={title}>
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      <ul className="space-y-2 text-sm">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
