/**
 * Application-wide constants that are policy decisions rather than configuration.
 * Anything an operator may need to change at runtime (fees, UPI ID, rate limits,
 * TTLs) lives in the environment or in app_settings instead of here.
 */

/** Versions of the legal documents a student accepts at registration. */
export const POLICY_VERSIONS = {
  terms: "2026-01",
  privacy: "2026-01",
} as const;

export const COOKIE_NAMES = {
  /** Student session cookie (HttpOnly). */
  studentSession: "ip_session",
  /** Admin session cookie (separate namespace, shorter lifetime). */
  adminSession: "ip_admin_session",
  /** Double-submit CSRF token (readable by the browser on purpose). */
  csrfToken: "ip_csrf",
  /** Dark/light preference (non-sensitive). */
  theme: "ip_theme",
} as const;

export const PAGINATION = {
  defaultPageSize: 20,
  allowedPageSizes: [20, 50, 100],
  maxPageSize: 100,
  /** Hard ceiling for export jobs to protect the database. */
  maxExportRows: 50_000,
} as const;

export const UPLOAD_RULES = {
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  allowedExtensions: [".jpg", ".jpeg", ".png", ".webp", ".pdf"],
  /** Executable and script extensions are rejected even if the MIME type lies. */
  blockedExtensions: [
    ".exe",
    ".dll",
    ".bat",
    ".cmd",
    ".com",
    ".msi",
    ".scr",
    ".ps1",
    ".sh",
    ".php",
    ".jsp",
    ".asp",
    ".aspx",
    ".js",
    ".mjs",
    ".cjs",
    ".jar",
    ".py",
    ".rb",
    ".pl",
    ".html",
    ".htm",
    ".svg",
  ],
  imageMimeTypes: ["image/jpeg", "image/png", "image/webp"],
} as const;

export const SESSION = {
  /** Minimum length of a session token (base64url characters). */
  tokenBytes: 32,
  /** Sessions idle for longer than this are revalidated against the database. */
  touchIntervalMinutes: 5,
} as const;

export const AUDIT = {
  /** Fields that must never be persisted in audit metadata or logs. */
  redactedKeys: [
    "password",
    "passwordHash",
    "otp",
    "code",
    "codeHash",
    "token",
    "tokenHash",
    "sessionToken",
    "secret",
    "mfaSecret",
    "apiKey",
    "authorization",
    "cookie",
    "csrf",
  ],
} as const;

export const CERTIFICATE = {
  prefix: "CERT",
  /** Random characters appended after the prefix, e.g. CERT-7F3K9Q2M. */
  randomLength: 8,
  /** Random characters in the public verification id. */
  verificationIdLength: 32,
  verificationPath: "/verify-certificate",
} as const;

export const STUDENT_NAV = [
  { key: "dashboard", label: "Dashboard", href: "/student/dashboard" },
  { key: "profile", label: "My Profile", href: "/student/profile" },
  { key: "internship", label: "My Internship", href: "/student/internship" },
  { key: "tasks", label: "Tasks", href: "/student/tasks" },
  { key: "projects", label: "Projects", href: "/student/projects" },
  { key: "submissions", label: "Submissions", href: "/student/submissions" },
  { key: "progress", label: "Progress", href: "/student/progress" },
  { key: "announcements", label: "Announcements", href: "/student/announcements" },
  { key: "certificate", label: "Certificate", href: "/student/certificate" },
  { key: "payment", label: "Payment", href: "/student/payment" },
  { key: "notifications", label: "Notifications", href: "/student/notifications" },
  { key: "settings", label: "Settings", href: "/student/settings" },
] as const;

export const PUBLIC_NAV = [
  { key: "internships", label: "Internships", href: "/internships" },
  { key: "domains", label: "Domains", href: "/domains" },
  { key: "how-it-works", label: "How It Works", href: "/how-it-works" },
  { key: "projects", label: "Projects", href: "/projects" },
  { key: "about", label: "About", href: "/about" },
  { key: "faq", label: "FAQ", href: "/faq" },
  { key: "contact", label: "Contact", href: "/contact" },
] as const;

export const FOOTER_NAV = {
  platform: [
    { label: "Internships", href: "/internships" },
    { label: "Domains", href: "/domains" },
    { label: "How It Works", href: "/how-it-works" },
    { label: "Projects", href: "/projects" },
    { label: "Verify Certificate", href: "/verify-certificate" },
  ],
  company: [
    { label: "About", href: "/about" },
    { label: "FAQ", href: "/faq" },
    { label: "Contact", href: "/contact" },
  ],
  legal: [
    { label: "Privacy Policy", href: "/privacy-policy" },
    { label: "Terms & Conditions", href: "/terms-and-conditions" },
    { label: "Certificate Policy", href: "/certificate-policy" },
    { label: "Refund Policy", href: "/refund-policy" },
  ],
} as const;

export const GITHUB = {
  /** Only github.com repository URLs are accepted for project hand-ins. */
  hostPattern: /^(www\.)?github\.com$/i,
  repoUrlPattern: /^https:\/\/(www\.)?github\.com\/[A-Za-z0-9_.-]{1,39}\/[A-Za-z0-9_.-]{1,100}(\/)?$/,
} as const;

/** UTR (UPI transaction reference) format used by Indian banks/NPCI. */
export const UTR = {
  pattern: /^[A-Za-z0-9]{8,30}$/,
} as const;
