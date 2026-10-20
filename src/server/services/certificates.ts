import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import QRCode from "qrcode";

import { ConflictError, NotFoundError } from "@/lib/api/errors";
import { getBranding } from "@/lib/config/branding";
import { getPrisma } from "@/lib/db/prisma";
import { sha256Hex } from "@/lib/security/crypto";
import { saveUpload } from "@/lib/storage/storage-service";
import { audit, type Actor } from "@/server/services/audit";
import { notifyAndEmail } from "@/server/services/notifications";
import { getSetting } from "@/server/services/settings";
import { normalizeTemplateKey, type CertificateTemplateKey } from "@/lib/difficulty";
import type { DifficultyLevel } from "@/generated/prisma/enums";

export type { CertificateTemplateKey };

/** Per-template visual identity: header label, stripe and paper tint. */
const TIER_SPEC: Record<CertificateTemplateKey, { label: string; stripe: [number, number, number]; pageColor: [number, number, number] }> = {
  standard: { label: "Standard", stripe: [0.85, 0.58, 0.08], pageColor: [0.96, 0.88, 0.68] },
  premium: { label: "Premium", stripe: [0.18, 0.34, 0.52], pageColor: [0.88, 0.92, 0.96] },
  hard: { label: "Hard Tier", stripe: [0.71, 0.14, 0.15], pageColor: [0.96, 0.88, 0.89] },
};

/** Unknown/legacy template keys fall back to the standard template. */
function toTemplateKey(key: string | null | undefined): CertificateTemplateKey {
  return key === "premium" || key === "hard" ? key : "standard";
}

const DEFAULT_DISCLAIMER =
  "This certificate confirms completion of an online internship program run by the issuing organisation. It is not a government, university, UGC or AICTE credential.";

/** Standard PDF fonts only cover WinAnsi; strip anything else instead of crashing on a name. */
function safe(font: PDFFont, text: string): string {
  const set = new Set(font.getCharacterSet());
  return [...text].map((ch) => (set.has(ch.codePointAt(0) ?? 0) ? ch : " ")).join("").replace(/\s+/g, " ").trim();
}

function hexToRgb(hex: string, fallback: [number, number, number]) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return rgb(...fallback);
  const n = parseInt(m[1] as string, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function formatLongDate(date: Date | null | undefined): string {
  return (date ?? new Date()).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export async function renderCertificatePdf(cert: {
  certificateId: string; verificationUrl: string; studentName: string; programTitle: string; domainName: string;
  duration: string; completionDate: Date | null; issueDate: Date; companyName: string; primaryColor: string; disclaimer: string;
  difficulty: DifficultyLevel; templateKey: CertificateTemplateKey;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([842, 595]);
  const { width, height } = page.getSize();
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const sansBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const tier = TIER_SPEC[cert.templateKey];
  const white = rgb(1, 1, 1);
  const primary = hexToRgb(cert.primaryColor, [0.31, 0.27, 0.9]);
  const ink = rgb(0.1, 0.12, 0.2);
  const muted = rgb(0.4, 0.43, 0.5);

  const center = (text: string, y: number, font: PDFFont, size: number, color = ink) => {
    const t = safe(font, text);
    page.drawText(t, { x: (width - font.widthOfTextAtSize(t, size)) / 2, y, size, font, color });
  };

  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(...tier.pageColor) });
  page.drawRectangle({ x: 46, y: 46, width: width - 92, height: height - 92, color: rgb(0.99, 0.985, 0.97) });
  page.drawRectangle({ x: 22, y: 22, width: width - 44, height: height - 44, borderColor: primary, borderWidth: 3 });
  page.drawRectangle({ x: 34, y: 34, width: width - 68, height: height - 68, borderColor: rgb(0.79, 0.64, 0.35), borderWidth: 0.8 });

  page.drawRectangle({ x: 0, y: height - 46, width, height: 46, color: rgb(...tier.stripe) });
  page.drawText(tier.label, { x: (width - sansBold.widthOfTextAtSize(tier.label, 12)) / 2, y: height - 30, size: 12, font: sansBold, color: white });

  center(cert.companyName, height - 92, sansBold, 20, primary);
  center("CERTIFICATE OF COMPLETION", height - 135, serifBold, 30);
  center("This is to certify that", height - 180, serif, 15, muted);

  let nameSize = 44;
  const name = safe(serifBold, cert.studentName);
  while (serifBold.widthOfTextAtSize(name, nameSize) > width - 160 && nameSize > 20) nameSize -= 2;
  center(name, height - 236, serifBold, nameSize, primary);
  page.drawLine({ start: { x: 220, y: height - 248 }, end: { x: width - 220, y: height - 248 }, thickness: 0.8, color: rgb(0.79, 0.64, 0.35) });

  center("has successfully completed the online internship", height - 282, serif, 15, muted);
  center(cert.programTitle, height - 318, serifBold, 24);
  center(`Domain: ${cert.domainName}   |   Duration: ${cert.duration}   |   Mode: Online`, height - 348, sans, 12, muted);
  center(`Completed on ${formatLongDate(cert.completionDate)}   |   Issued on ${formatLongDate(cert.issueDate)}`, height - 370, sans, 12, muted);

  const qr = await QRCode.toBuffer(cert.verificationUrl, { width: 260, margin: 1, errorCorrectionLevel: "M" });
  const qrImage = await pdf.embedPng(qr);
  page.drawImage(qrImage, { x: width - 150, y: 70, width: 92, height: 92 });
  page.drawText("Scan to verify", { x: width - 143, y: 56, size: 9, font: sans, color: muted });

  page.drawText(safe(sansBold, `Certificate ID: ${cert.certificateId}`), { x: 70, y: 128, size: 11, font: sansBold, color: ink });
  page.drawText(safe(sans, "Verify at:"), { x: 70, y: 110, size: 10, font: sans, color: muted });
  page.drawText(safe(sans, cert.verificationUrl), { x: 70, y: 96, size: 9, font: sans, color: primary });

  const words = safe(sans, cert.disclaimer).split(" ");
  let line = ""; let y = 70;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (sans.widthOfTextAtSize(next, 8) > width - 270) { page.drawText(line, { x: 70, y, size: 8, font: sans, color: muted }); y -= 11; line = word; } else line = next;
  }
  if (line) page.drawText(line, { x: 70, y, size: 8, font: sans, color: muted });

  pdf.setTitle(`Certificate ${cert.certificateId}`);
  pdf.setAuthor(cert.companyName);
  return pdf.save();
}

/** Job handler. Idempotent: a certificate that already has a PDF is left alone. */
export async function generateCertificate(certificateRowId: string): Promise<void> {
  const prisma = getPrisma();
  const cert = await prisma.certificate.findUnique({
    where: { id: certificateRowId },
    include: {
      student: { select: { id: true, email: true, name: true } },
      template: { select: { config: true, templateKey: true } },
    },
  });
  if (!cert) throw new NotFoundError("Certificate not found.");
  if (cert.status === "GENERATED" && cert.pdfFileId) return;
  if (cert.status === "REVOKED") return;

  const branding = getBranding();
  const config = (cert.template?.config ?? {}) as { primaryColor?: string; templateKey?: string };
  const issueDate = new Date();
  const disclaimer = await getSetting<string>("certificate_disclaimer", DEFAULT_DISCLAIMER);
  const bytes = await renderCertificatePdf({
    certificateId: cert.certificateId, verificationUrl: cert.verificationUrl, studentName: cert.snapshotStudentName,
    programTitle: cert.snapshotProgramTitle, domainName: cert.snapshotDomainName, duration: cert.snapshotDuration,
    completionDate: cert.completionDate, issueDate, companyName: branding.companyName,
    primaryColor: config.primaryColor ?? branding.primaryColor, disclaimer: (disclaimer || DEFAULT_DISCLAIMER).replaceAll("{{companyName}}", branding.companyName),
    difficulty: cert.projectDifficulty, templateKey: toTemplateKey(cert.template?.templateKey ?? config.templateKey),
  });
  const body = Buffer.from(bytes);
  const file = await saveUpload({
    purpose: "CERTIFICATE_PDF", ownerUserId: cert.studentId, originalName: `${cert.certificateId}.pdf`,
    mimeType: "application/pdf", body, checksumSha256: sha256Hex(body.toString("latin1")),
  });
  await prisma.fileAsset.update({ where: { id: file.id }, data: { scanStatus: "SKIPPED" } });

  const updated = await prisma.certificate.updateMany({
    where: { id: cert.id, status: "PENDING" },
    data: { status: "GENERATED", pdfFileId: file.id, issueDate, generatedAt: issueDate },
  });
  if (updated.count === 0) return;

  await audit({ userId: null, role: "SYSTEM" }, "CERTIFICATE_GENERATED", "Certificate", cert.id, { certificateId: cert.certificateId });
  await notifyAndEmail({
    userId: cert.student.id, email: cert.student.email, recipientName: cert.student.name ?? "Student", type: "CERTIFICATE_ISSUED",
    title: "Your certificate is ready", body: `Certificate ${cert.certificateId} is available to view and download.`, link: "/student/certificate",
    templateKey: "certificate_issued", variables: { certificateId: cert.certificateId, verificationUrl: cert.verificationUrl },
  });
}

export type VerificationResult =
  | { status: "VALID"; certificate: { certificateId: string; studentName: string; programTitle: string; domainName: string; issuedAt: Date | null } }
  | { status: "REVOKED"; certificate: { certificateId: string; revokedAt: Date | null } }
  | { status: "NOT_FOUND" };

/** Public lookup by verification ID or certificate ID. Exposes only what a verifier needs. */
export async function verifyCertificate(identifier: string): Promise<VerificationResult> {
  const id = identifier.trim();
  const cert = await getPrisma().certificate.findFirst({
    where: { OR: [{ verificationId: id }, { certificateId: id.toUpperCase() }] },
    select: { certificateId: true, status: true, revokedAt: true, issueDate: true, snapshotStudentName: true, snapshotProgramTitle: true, snapshotDomainName: true },
  });
  if (!cert || cert.status === "PENDING") return { status: "NOT_FOUND" };
  if (cert.status === "REVOKED" || cert.revokedAt) return { status: "REVOKED", certificate: { certificateId: cert.certificateId, revokedAt: cert.revokedAt } };
  return {
    status: "VALID",
    certificate: { certificateId: cert.certificateId, studentName: cert.snapshotStudentName, programTitle: cert.snapshotProgramTitle, domainName: cert.snapshotDomainName, issuedAt: cert.issueDate },
  };
}

export async function revokeCertificate(actor: Actor, certificateId: string, reason: string): Promise<void> {
  const claimed = await getPrisma().certificate.updateMany({
    where: { id: certificateId, status: { not: "REVOKED" } },
    data: { status: "REVOKED", revokedAt: new Date(), revokedById: actor.userId ?? null, revocationReason: reason.slice(0, 500) },
  });
  if (claimed.count === 0) throw new ConflictError("This certificate is already revoked or does not exist.");
  await audit(actor, "CERTIFICATE_REVOKED", "Certificate", certificateId, { reason });
}

export async function getOwnCertificate(studentId: string, id: string) {
  const cert = await getPrisma().certificate.findFirst({ where: { id, studentId } });
  if (!cert) throw new NotFoundError("Certificate not found.");
  return cert;
}
