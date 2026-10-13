/**
 * Text helpers used for slugs, URLs and safe display of user/admin content.
 *
 * XSS protection is React's automatic escaping plus an explicit CSP - these
 * helpers never build HTML. They only normalise text and reject control
 * characters that could break logs or PDF rendering.
 */

/** Removes control characters that have no place in stored text. */
export function stripControlCharacters(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

/** Collapses runs of whitespace into single spaces and trims the result. */
export function normaliseWhitespace(value: string): string {
  return stripControlCharacters(value).replace(/\s+/g, " ").trim();
}

/** URL-safe slug, e.g. "Full Stack Development" -> "full-stack-development". */
export function slugify(value: string): string {
  return normaliseWhitespace(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}\u2026`;
}

/** Uppercase display for enumerated values: "UNDER_REVIEW" -> "Under review". */
export function humaniseEnumValue(value: string): string {
  const spaced = value.replace(/[_-]+/g, " ").toLowerCase().trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Masks a display name for public certificate previews, e.g. "A***h Kumar". */
export function maskStudentName(fullName: string): string {
  const parts = normaliseWhitespace(fullName).split(" ");
  return parts
    .map((part, index) => {
      if (index === parts.length - 1 && parts.length > 1) return part;
      if (part.length <= 1) return part;
      return `${part.charAt(0)}${"*".repeat(Math.max(1, part.length - 2))}${part.charAt(part.length - 1)}`;
    })
    .join(" ");
}

/** Two-letter initials for avatars. */
export function initialsFromName(fullName: string): string {
  const parts = normaliseWhitespace(fullName).split(" ").filter(Boolean);
  const first = parts[0]?.charAt(0) ?? "?";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

/**
 * Splits a comma or newline separated list (used for skills, prerequisites and
 * learning outcomes coming from admin forms).
 */
export function parseDelimitedList(value: string, maxItems = 40): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => normaliseWhitespace(item))
    .filter((item) => item.length > 0)
    .slice(0, maxItems);
}
