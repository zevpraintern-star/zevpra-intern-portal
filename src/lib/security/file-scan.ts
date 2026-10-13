/**
 * Content sniffing. A browser-supplied MIME type or file extension is trivially
 * forged, so uploads are accepted only when the leading bytes match the claimed type.
 */
export type SniffedType = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

export function sniffMime(buffer: Buffer): SniffedType | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  return null;
}

const EXTENSION_FOR: Record<SniffedType, readonly string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "application/pdf": [".pdf"],
};

export function extensionMatches(type: SniffedType, extension: string): boolean {
  return EXTENSION_FOR[type].includes(extension.toLowerCase());
}

/** PDFs can carry active content; flag the common launch vectors for manual review. */
export function suspiciousPdf(buffer: Buffer): boolean {
  const text = buffer.toString("latin1");
  return /\/(JavaScript|JS|Launch|EmbeddedFile)\b/.test(text);
}

/** Pluggable scanner hook. Swap in ClamAV (clamd) here without touching callers. */
export interface ScanOutcome { status: "CLEAN" | "INFECTED" | "SKIPPED"; reason?: string }
export async function scanBuffer(buffer: Buffer, claimed: SniffedType | null): Promise<ScanOutcome> {
  const sniffed = sniffMime(buffer);
  if (!sniffed || (claimed && sniffed !== claimed)) return { status: "INFECTED", reason: "content does not match declared type" };
  if (sniffed === "application/pdf" && suspiciousPdf(buffer)) return { status: "INFECTED", reason: "pdf contains active content" };
  return { status: "CLEAN" };
}
