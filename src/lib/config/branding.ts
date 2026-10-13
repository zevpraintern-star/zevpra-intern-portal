import { getEnv } from "./env";

/**
 * Centralised branding.
 *
 * The company name is "Zevpra Intern". Nothing in the UI, metadata, emails or
 * certificates hardcodes it directly: changing COMPANY_NAME (or the
 * brand.company_name setting once the admin panel is live) rebrands everything.
 *
 * Founder information is intentionally not part of this configuration and is
 * never rendered on public pages.
 */

export const BRAND_PLACEHOLDER = "Zevpra Intern";

export interface BrandingConfig {
  /** Display name used in UI copy, emails, metadata and certificates. */
  companyName: string;
  /** Compact name for tight layouts (navigation, footer badge). */
  companyShortName: string;
  /** Registered legal entity name, only when the founders confirm it. */
  companyLegalName: string | null;
  /** Bare host used in verification URLs and QR payloads. */
  domain: string;
  /** Absolute application base URL, e.g. https://example.com (no trailing slash). */
  appUrl: string;
  supportEmail: string;
  contactEmail: string;
  primaryColor: string;
  secondaryColor: string;
  /** Optional certificate fee label helper values. */
  certificateFee: number;
  currency: string;
  /** Social links are only rendered when configured. */
  socialLinks: {
    linkedin?: string;
    github?: string;
    x?: string;
  };
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getBranding(): BrandingConfig {
  const env = getEnv();
  return {
    companyName: env.COMPANY_NAME || BRAND_PLACEHOLDER,
    companyShortName: env.COMPANY_SHORT_NAME || env.COMPANY_NAME || BRAND_PLACEHOLDER,
    companyLegalName: env.COMPANY_LEGAL_NAME ?? null,
    domain: env.COMPANY_DOMAIN,
    appUrl: trimTrailingSlash(env.APP_URL),
    supportEmail: env.SUPPORT_EMAIL,
    contactEmail: env.CONTACT_EMAIL ?? env.SUPPORT_EMAIL,
    primaryColor: env.PRIMARY_COLOR,
    secondaryColor: env.SECONDARY_COLOR,
    certificateFee: env.CERTIFICATE_FEE,
    currency: env.CURRENCY,
    socialLinks: {},
  };
}

/** Subset of branding an administrator may override from app_settings (Phase 6). */
export type BrandingOverrides = Partial<
  Pick<BrandingConfig, "companyName" | "companyShortName" | "supportEmail" | "primaryColor" | "secondaryColor">
>;

export function applyBrandingOverrides(
  base: BrandingConfig,
  overrides?: BrandingOverrides | null,
): BrandingConfig {
  if (!overrides) return base;
  return {
    ...base,
    ...Object.fromEntries(
      Object.entries(overrides).filter(([, value]) => typeof value === "string" && value.length > 0),
    ),
  } as BrandingConfig;
}

/**
 * Replaces {{token}} placeholders in seeded copy, emails and settings.
 * Unknown tokens are left untouched so missing data is visible, not silent.
 */
export function interpolateBrandTokens(
  template: string,
  extraTokens: Record<string, string | number> = {},
): string {
  const branding = getBranding();
  const tokens: Record<string, string | number> = {
    companyName: branding.companyName,
    companyShortName: branding.companyShortName,
    companyDomain: branding.domain,
    supportEmail: branding.supportEmail,
    certificateFee: branding.certificateFee,
    currency: branding.currency,
    ...extraTokens,
  };

  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, token: string) => {
    const value = tokens[token];
    return value === undefined ? match : String(value);
  });
}

/** Absolute URL helper used for verification links, email CTAs and QR payloads. */
export function absoluteUrl(path: string): string {
  const branding = getBranding();
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${branding.appUrl}${suffix}`;
}
