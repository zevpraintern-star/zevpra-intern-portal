import Link from "next/link";

import { cn } from "@/lib/utils/cn";

/**
 * Temporary text wordmark.
 *
 * The company name is not final, so the logo is deliberately text based and reads
 * its label from centralised branding. Replacing it with an SVG/PNG asset later
 * does not require touching any page: swap the markup here only.
 */
export function Logo({
  name,
  href = "/",
  className,
  showMark = true,
}: {
  /** Passed in explicitly so this component is safe in client and server trees. */
  name: string;
  href?: string;
  className?: string;
  showMark?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2 rounded-md text-base font-semibold tracking-tight",
        "focus-visible:outline-offset-4",
        className,
      )}
    >
      {showMark ? (
        <span
          aria-hidden="true"
          className="relative inline-flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"
        >
          {/* Abstract node/growth mark - no company name baked into the artwork. */}
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="12" cy="5.5" r="2.2" />
            <circle cx="5.5" cy="16.5" r="2.2" />
            <circle cx="18.5" cy="16.5" r="2.2" />
            <path d="M10.6 7.4 6.6 14.6M13.4 7.4l4 7.2M7.7 16.5h8.6" strokeLinecap="round" />
          </svg>
        </span>
      ) : null}
      <span className="max-w-[9rem] truncate sm:max-w-none">{name}</span>
    </Link>
  );
}
