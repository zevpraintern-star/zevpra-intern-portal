import type { Metadata, Viewport } from "next";

import { ThemeProvider } from "@/components/theme/theme-provider";
import { getBranding } from "@/lib/config/branding";

import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";

import "./globals.css";

/**
 * Root layout.
 *
 * Kept minimal on purpose: it wires the theme provider and document-level metadata
 * from centralised branding. Section chrome (public header/footer) lives in the
 * (public) route group so the student portal and admin panel can define their own.
 */

export function generateMetadata(): Metadata {
  const branding = getBranding();
  const baseUrl = branding.appUrl;

  return {
    metadataBase: new URL(baseUrl),
    title: {
      default: `${branding.companyName} - Free Online Internships for Engineering Students`,
      template: `%s | ${branding.companyName}`,
    },
    description:
      "Free online internships for engineering students: structured tasks, mentor-reviewed submissions and an optional verified certificate.",
    applicationName: branding.companyName,
    authors: [{ name: branding.companyName }],
    keywords: [
      "internship",
      "online internship",
      "engineering internship",
      "free internship",
      "B.Tech internship",
      "student projects",
    ],
    alternates: {
      canonical: "/",
    },
    openGraph: {
      type: "website",
      url: baseUrl,
      siteName: branding.companyName,
      title: `${branding.companyName} - Free Online Internships`,
      description:
        "Learn. Build. Intern. Grow. Structured online internships with real tasks, a final GitHub project and an optional verified certificate.",
    },
    twitter: {
      card: "summary_large_image",
      title: `${branding.companyName} - Free Online Internships`,
      description:
        "Free online internships for engineering students with structured tasks and mentor-reviewed project work.",
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true },
    },
    icons: {
      icon: "/favicon.ico",
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1120" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning is required: next-themes sets the theme class before
    // React hydrates, which is intentional and not a bug.
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
