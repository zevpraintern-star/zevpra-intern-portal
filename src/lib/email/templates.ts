import { getBranding } from "../config/branding";

/**
 * Email rendering.
 *
 * Templates are stored in the email_templates table so administrators can edit
 * subject lines and copy without a deployment. The fallbacks below guarantee that
 * security-critical mail (verification codes, security notices) still works on a
 * fresh deployment before the seed has been run.
 *
 * Rendering is deliberately simple: {{token}} substitution with HTML escaping.
 * No template engine evaluates expressions, so a template edit cannot execute code.
 */

export type EmailVariables = Record<string, string | number | null | undefined>;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Replaces {{token}} placeholders. Unknown tokens collapse to an empty string. */
export function renderTemplate(template: string, variables: EmailVariables, escape = true): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, token: string) => {
    const raw = variables[token];
    if (raw === undefined || raw === null) return "";
    const text = String(raw);
    return escape ? escapeHtml(text) : text;
  });
}

/** Tokens available to every template. */
export function baseEmailVariables(): EmailVariables {
  const branding = getBranding();
  return {
    companyName: branding.companyName,
    companyShortName: branding.companyShortName,
    supportEmail: branding.supportEmail,
    appUrl: branding.appUrl,
    certificateFee: branding.certificateFee,
    currency: branding.currency,
    currentYear: new Date().getFullYear(),
  };
}

export interface EmailTemplateDefinition {
  key: string;
  name: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

function shell(heading: string, lines: string[], ctaLabel?: string): string {
  const paragraphs = lines.map((line) => `<p style="margin:0 0 12px">${line}</p>`).join("");
  const cta = ctaLabel
    ? `<p style="margin:20px 0"><a href="{{actionUrl}}" style="background:#4f46e5;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none">${ctaLabel}</a></p>`
    : "";
  return [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#111827;max-width:560px">',
    `<h2 style="margin:0 0 16px">${heading}</h2>`,
    paragraphs,
    cta,
    '<p style="margin:24px 0 0;color:#6b7280;font-size:13px">',
    "This is an automated message from {{companyName}}. Never share one-time codes or private links with anyone.",
    "</p>",
    "</div>",
  ].join("");
}

/**
 * Fallback templates. The seeded database rows are the canonical, admin-editable
 * versions; these exist so a security-critical email can always be delivered.
 */
export const FALLBACK_EMAIL_TEMPLATES: Record<string, EmailTemplateDefinition> = {
  otp_code: {
    key: "otp_code",
    name: "Email OTP",
    subject: "{{companyName}} verification code",
    bodyHtml: shell("Your one-time code", [
      "Hello {{recipientName}},",
      "Use the code below to continue. It expires in {{expiryMinutes}} minutes.",
      '<span style="font-size:28px;letter-spacing:6px;font-weight:bold">{{code}}</span>',
      "If you did not request this code you can ignore this email.",
    ]),
    bodyText:
      "Your {{companyName}} verification code is {{code}}. It expires in {{expiryMinutes}} minutes.",
  },
  welcome: {
    key: "welcome",
    name: "Welcome",
    subject: "Welcome to {{companyName}}",
    bodyHtml: shell(
      "Welcome aboard",
      [
        "Hello {{recipientName}},",
        "Your account is ready. You can now browse internship programs and apply - joining is free.",
      ],
      "Open your dashboard",
    ),
    bodyText: "Welcome to {{companyName}}. Open your dashboard: {{actionUrl}}",
  },
  security_alert: {
    key: "security_alert",
    name: "Security notification",
    subject: "Security notice for your account",
    bodyHtml: shell("Security notice", [
      "Hello {{recipientName}},",
      "{{activity}}",
      "If this was not you, contact support immediately at {{supportEmail}}.",
    ]),
    bodyText: "Security notice: {{activity}}",
  },
};

export function getFallbackTemplate(key: string): EmailTemplateDefinition | null {
  return FALLBACK_EMAIL_TEMPLATES[key] ?? null;
}
