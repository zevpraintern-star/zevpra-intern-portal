/**
 * Formatting helpers. All dates are rendered in a single application time zone so
 * certificates, deadlines and audit records agree regardless of server location.
 */

export const APP_TIME_ZONE = "Asia/Kolkata";
const DEFAULT_LOCALE = "en-IN";

const dateFormatter = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: APP_TIME_ZONE,
});

const dateTimeFormatter = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: APP_TIME_ZONE,
});

const relativeFormatter = new Intl.RelativeTimeFormat(DEFAULT_LOCALE, { numeric: "auto" });

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "-";
  return dateFormatter.format(date);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "-";
  return dateTimeFormatter.format(date);
}

export function formatCurrency(amount: number | string, currency = "INR"): string {
  const numeric = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(numeric)) return "-";
  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(numeric);
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function formatRelativeTime(value: Date | string | null | undefined): string {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "-";

  const deltaSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const divisions: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
    { amount: 60, unit: "second" },
    { amount: 3600, unit: "minute" },
    { amount: 86_400, unit: "hour" },
    { amount: 604_800, unit: "day" },
    { amount: 2_629_800, unit: "week" },
    { amount: 31_557_600, unit: "month" },
  ];

  let chosen = divisions[0];
  for (const division of divisions) {
    if (Math.abs(deltaSeconds) >= division.amount) chosen = division;
  }
  if (!chosen) return relativeFormatter.format(deltaSeconds, "second");

  return relativeFormatter.format(Math.round(deltaSeconds / chosen.amount), chosen.unit);
}

/** Decimal-safe money conversion for Prisma Decimal values. */
export function toNumber(value: { toString(): string } | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Whole-unit price for display copy, e.g. "₹50" (no ".00"); keeps decimals only when present. */
export function formatPrice(amount: number | string, currency = "INR"): string {
  const numeric = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(numeric)) return "-";
  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numeric);
}
