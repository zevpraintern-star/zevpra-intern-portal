import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont } from "pdf-lib";
import QRCode from "qrcode";
import { Prisma } from "@/generated/prisma/client";

import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/api/errors";
import { getBranding } from "@/lib/config/branding";
import { getPrisma } from "@/lib/db/prisma";
import { CERTIFICATE } from "@/lib/config/constants";
import { randomCode, sha256Hex } from "@/lib/security/crypto";
import { logger } from "@/lib/logger";
import { saveUpload } from "@/lib/storage/storage-service";
import { audit, type Actor } from "@/server/services/audit";
import { notifyAndEmail } from "@/server/services/notifications";
import { getSetting } from "@/server/services/settings";
import { normalizeTemplateKey, selectCertificateTemplate, type CertificateTemplateKey } from "@/lib/difficulty";
import type { DifficultyLevel } from "@/generated/prisma/enums";
import { enqueueJob, kickJobs } from "@/server/jobs/queue";
import { approvedTaskMarks, scoreBreakdown } from "@/server/services/scoring";

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

function formatLongDate(date: Date | null | undefined): string {
  return (date ?? new Date()).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export async function renderCertificatePdf(cert: {
  certificateId: string; verificationUrl: string; studentName: string; programTitle: string; domainName: string;
  duration: string; completionDate: Date | null; issueDate: Date; companyName: string; disclaimer: string;
  difficulty: DifficultyLevel; templateKey: CertificateTemplateKey;
  taskScorePercent?: number | null; projectScorePercent?: number | null; overallScorePercent?: number | null;
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
  const tierColor = rgb(0.16, 0.28, 0.44);
  const wrapped = (text: string, x: number, y: number, maxWidth: number, font: PDFFont, size: number, color: ReturnType<typeof rgb>, lineHeight: number, maxLines: number) => {
    const words = safe(font, text).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) line = candidate;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    lines.slice(0, maxLines).forEach((lineText, index) => page.drawText(lineText, { x, y: y - index * lineHeight, size, font, color }));
  };

  // Modern Split layout, using the same connected-node mark as the website logo.
  const sideWidth = 160;
  const contentLeft = sideWidth + 28;
  const contentRight = width - 25;
  const contentWidth = contentRight - contentLeft;
  const contentCenter = contentLeft + contentWidth / 2;
  const ink = rgb(0.07, 0.12, 0.2);
  const muted = rgb(0.34, 0.43, 0.56);
  const line = rgb(0.84, 0.88, 0.93);
  const paleBlue = rgb(0.91, 0.94, 0.98);
  const logoBlue = rgb(0.48, 0.62, 1);
  const logoInk = rgb(0.035, 0.07, 0.14);

  page.drawRectangle({ x: 0, y: 0, width, height, color: white });
  page.drawRectangle({ x: 0, y: 0, width: sideWidth, height, color: rgb(0.055, 0.11, 0.2) });
  page.drawRectangle({ x: sideWidth - 2, y: 0, width: 2, height, color: rgb(0.13, 0.25, 0.4) });

  // Recreate the site's blue app tile and connected-node logo in vector form.
  page.drawRectangle({ x: 20, y: height - 82, width: 42, height: 42, color: logoBlue });
  const mark = (x: number, y: number) => page.drawCircle({ x, y, size: 2.4, color: logoInk });
  page.drawLine({ start: { x: 41, y: height - 49 }, end: { x: 31, y: height - 68 }, thickness: 1.6, color: logoInk });
  page.drawLine({ start: { x: 41, y: height - 49 }, end: { x: 51, y: height - 68 }, thickness: 1.6, color: logoInk });
  page.drawLine({ start: { x: 31, y: height - 68 }, end: { x: 51, y: height - 68 }, thickness: 1.6, color: logoInk });
  mark(41, height - 48);
  mark(30, height - 69);
  mark(52, height - 69);
  page.drawText(safe(sansBold, cert.companyName), { x: 20, y: height - 108, size: 13, font: sansBold, color: white, maxWidth: sideWidth - 38 });
  page.drawText("PROFESSIONAL INTERNSHIP PROGRAM", { x: 24, y: 150, size: 8, font: sans, color: rgb(0.76, 0.82, 0.9), rotate: degrees(90) });
  page.drawText("DIGITAL CREDENTIAL", { x: 20, y: 22, size: 7, font: sansBold, color: rgb(0.83, 0.88, 0.95) });

  const title = "CERTIFICATE OF COMPLETION";
  const titleSize = Math.min(19, contentWidth / (serifBold.widthOfTextAtSize(title, 19) / 19));
  page.drawText(title, { x: contentLeft, y: height - 65, size: titleSize, font: serifBold, color: ink });
  page.drawText(`VERIFIED LEARNING  -  ${cert.issueDate.getUTCFullYear()}`, { x: contentLeft, y: height - 43, size: 7.5, font: sans, color: rgb(0.2, 0.36, 0.62) });
  page.drawRectangle({ x: contentRight - 92, y: height - 54, width: 92, height: 24, color: tierColor });
  const tierText = safe(sansBold, tier.label.toUpperCase());
  const tierSize = Math.min(7.5, 76 / Math.max(sansBold.widthOfTextAtSize(tierText, 7.5) / 7.5, 1));
  page.drawText(tierText, { x: contentRight - 92 + (92 - sansBold.widthOfTextAtSize(tierText, tierSize)) / 2, y: height - 45, size: tierSize, font: sansBold, color: white });

  const rightCentered = (text: string, y: number, font: PDFFont, size: number, color: ReturnType<typeof rgb>, maxWidth = contentWidth - 24) => {
    const value = safe(font, text);
    const fittedSize = Math.min(size, maxWidth / Math.max(font.widthOfTextAtSize(value, size) / size, 1));
    page.drawText(value, { x: contentCenter - font.widthOfTextAtSize(value, fittedSize) / 2, y, size: fittedSize, font, color });
  };
  rightCentered("Awarded to", 350, sans, 12, muted);
  rightCentered(cert.studentName, 305, serif, 38, rgb(0.16, 0.32, 0.53), contentWidth - 34);
  rightCentered("for successfully completing", 275, sans, 11, muted);
  rightCentered(cert.programTitle, 244, serif, 18, rgb(0.25, 0.34, 0.47), contentWidth - 35);

  // Program facts sit in a light, three-column band.
  const panelX = contentLeft;
  const panelY = 188;
  const panelW = contentWidth;
  const panelH = 49;
  page.drawRectangle({ x: panelX, y: panelY, width: panelW, height: panelH, color: paleBlue });
  const colW = panelW / 3;
  page.drawLine({ start: { x: panelX + colW, y: panelY + 8 }, end: { x: panelX + colW, y: panelY + panelH - 8 }, thickness: 0.7, color: line });
  page.drawLine({ start: { x: panelX + colW * 2, y: panelY + 8 }, end: { x: panelX + colW * 2, y: panelY + panelH - 8 }, thickness: 0.7, color: line });
  const facts = [
    { label: "DOMAIN", value: cert.domainName },
    { label: "DURATION", value: cert.duration },
    { label: "FORMAT", value: "Online" },
  ];
  facts.forEach((fact, index) => {
    const x = panelX + colW * index;
    const value = safe(sansBold, fact.value);
    const valueSize = Math.min(11, (colW - 18) / Math.max(sansBold.widthOfTextAtSize(value, 11) / 11, 1));
    const labelWidth = sansBold.widthOfTextAtSize(fact.label, 7);
    page.drawText(fact.label, { x: x + (colW - labelWidth) / 2, y: panelY + 31, size: 7, font: sansBold, color: muted });
    page.drawText(value, { x: x + (colW - sansBold.widthOfTextAtSize(value, valueSize)) / 2, y: panelY + 13, size: valueSize, font: sansBold, color: ink });
  });

  const scoreY = 111;
  const scoreH = 48;
  page.drawRectangle({ x: panelX, y: scoreY, width: panelW, height: scoreH, color: paleBlue });
  const scoreFacts = [
    { label: "TASK SCORE", value: cert.taskScorePercent },
    { label: "PROJECT SCORE", value: cert.projectScorePercent },
    { label: "OVERALL SCORE", value: cert.overallScorePercent },
  ];
  scoreFacts.forEach((fact, index) => {
    const x = panelX + colW * index;
    const value = fact.value === null || fact.value === undefined ? "N/A" : `${fact.value.toFixed(2)}%`;
    const valueSize = Math.min(12, (colW - 18) / Math.max(sansBold.widthOfTextAtSize(value, 12) / 12, 1));
    const labelWidth = sansBold.widthOfTextAtSize(fact.label, 7);
    page.drawText(fact.label, { x: x + (colW - labelWidth) / 2, y: scoreY + 30, size: 7, font: sansBold, color: muted });
    page.drawText(value, { x: x + (colW - sansBold.widthOfTextAtSize(value, valueSize)) / 2, y: scoreY + 11, size: valueSize, font: sansBold, color: ink });
  });

  // Draw original vector merit medals in the open space below the certificate
  // heading. These are made from PDF shapes and text, with no external artwork.
  const overall = cert.overallScorePercent;
  const awards = overall !== null && overall !== undefined
    ? overall >= 76 && overall <= 100
      ? [{ label: "SILVER", color: rgb(0.64, 0.69, 0.76), light: rgb(0.9, 0.92, 0.95), dark: rgb(0.39, 0.46, 0.55) }, { label: "GOLD", color: rgb(0.9, 0.68, 0.2), light: rgb(1, 0.93, 0.7), dark: rgb(0.68, 0.43, 0.08) }]
      : overall >= 61 && overall <= 75
        ? [{ label: "SILVER", color: rgb(0.64, 0.69, 0.76), light: rgb(0.9, 0.92, 0.95), dark: rgb(0.39, 0.46, 0.55) }]
        : []
    : [];
  const awardGap = 104;
  const awardStart = contentCenter - ((awards.length - 1) * awardGap) / 2;
  awards.forEach((award, index) => {
    const cx = awardStart + index * awardGap;
    const cy = 451;
    // Short ribbon tails sit behind the medallion, creating a compact award silhouette.
    page.drawRectangle({ x: cx - 12, y: cy - 32, width: 8, height: 29, color: award.dark, borderColor: white, borderWidth: 0.5 });
    page.drawRectangle({ x: cx + 4, y: cy - 32, width: 8, height: 29, color: award.color, borderColor: white, borderWidth: 0.5 });
    page.drawLine({ start: { x: cx - 12, y: cy - 25 }, end: { x: cx - 4, y: cy - 25 }, thickness: 0.8, color: award.light });
    page.drawLine({ start: { x: cx + 4, y: cy - 25 }, end: { x: cx + 12, y: cy - 25 }, thickness: 0.8, color: award.light });
    page.drawCircle({ x: cx, y: cy, size: 22, color: award.dark, borderColor: white, borderWidth: 0.8 });
    page.drawCircle({ x: cx, y: cy, size: 18, color: award.color, borderColor: award.light, borderWidth: 1.2 });
    page.drawCircle({ x: cx, y: cy, size: 13.5, color: award.light, borderColor: white, borderWidth: 0.7 });
    const monogram = "Z";
    const monogramSize = 16;
    page.drawText(monogram, { x: cx - serifBold.widthOfTextAtSize(monogram, monogramSize) / 2, y: cy - 5.5, size: monogramSize, font: serifBold, color: award.dark });
    const brand = "ZEVPRA INTERN AWARD";
    const brandSize = 6.5;
    page.drawText(brand, { x: cx - sansBold.widthOfTextAtSize(brand, brandSize) / 2, y: cy - 42, size: brandSize, font: sansBold, color: muted });
    const level = award.label;
    const levelSize = 6;
    page.drawText(level, { x: cx - sansBold.widthOfTextAtSize(level, levelSize) / 2, y: cy - 51, size: levelSize, font: sansBold, color: award.dark });
  });

  page.drawText(`COMPLETED  ${formatLongDate(cert.completionDate)}`, { x: contentLeft, y: 73, size: 8, font: sans, color: muted });
  page.drawText(`ISSUED  ${formatLongDate(cert.issueDate)}`, { x: contentCenter + 10, y: 73, size: 8, font: sans, color: muted });
  page.drawText(`CERTIFICATE ID  ${safe(sansBold, cert.certificateId)}`, { x: contentLeft, y: 55, size: 8.5, font: sansBold, color: ink });
  const safeUrl = safe(sans, cert.verificationUrl);
  const urlSize = Math.min(7, (contentWidth - 85) / Math.max(sans.widthOfTextAtSize(safeUrl, 7) / 7, 1));
  page.drawText(safeUrl, { x: contentLeft, y: 39, size: urlSize, font: sans, color: rgb(0.2, 0.36, 0.62) });

  const qr = await QRCode.toBuffer(cert.verificationUrl, { width: 260, margin: 1, errorCorrectionLevel: "M" });
  const qrImage = await pdf.embedPng(qr);
  page.drawRectangle({ x: width - 94, y: 24, width: 68, height: 68, color: white, borderColor: line, borderWidth: 0.7 });
  page.drawImage(qrImage, { x: width - 90, y: 28, width: 60, height: 60 });
  const qrCaption = "SCAN TO VERIFY";
  page.drawText(qrCaption, {
    x: width - 94 + (68 - sansBold.widthOfTextAtSize(qrCaption, 5.5)) / 2,
    y: 16,
    size: 5.5,
    font: sansBold,
    color: muted,
  });

  wrapped(cert.disclaimer, contentLeft, 25, contentWidth - 92, sans, 6, muted, 8, 2);

  pdf.setTitle(`Certificate ${cert.certificateId}`);
  pdf.setAuthor(cert.companyName);
  return pdf.save();
}

/** Admin release for a completed application. Safe to retry for legacy records. */
export async function releaseFreeCertificate(applicationId: string, actor: Actor) {
  const prisma = getPrisma();
  const branding = getBranding();

  const result = await prisma.$transaction(async (tx) => {
    // Serialize requests for this application so retries cannot create duplicate certificates.
    await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM applications WHERE id = ${applicationId}::uuid FOR UPDATE`,
    );
    const application = await tx.application.findFirst({
      where: {
        id: applicationId,
        completionStatus: "COMPLETED",
        certificateEligibleAt: { not: null },
      },
      include: {
        student: { select: { id: true, name: true, studentProfile: { select: { fullName: true, college: true } } } },
        program: { select: { id: true, title: true, durationLabel: true, difficulty: true, domain: { select: { name: true } } } },
      },
    });
    if (!application) throw new ForbiddenError("A certificate can be released only after the final project is approved.");

    const existing = await tx.certificate.findFirst({ where: { applicationId: application.id } });
    if (existing?.status === "REVOKED") throw new ConflictError("This certificate was revoked and cannot be released again.");
    if (existing) return { certificate: existing, released: existing.status !== "GENERATED" };

    const taskMarks = await approvedTaskMarks(tx, application);
    const finalProject = application.selectedProjectId
      ? await tx.projectSubmission.findUnique({
          where: { projectId_studentId: { projectId: application.selectedProjectId, studentId: application.studentId } },
          select: { score: true, project: { select: { maxScore: true } } },
        })
      : null;
    const scores = scoreBreakdown(taskMarks, finalProject?.score ?? 0, finalProject?.project.maxScore ?? 0);

    const template = selectCertificateTemplate(await tx.certificateTemplate.findMany(), application.program.difficulty);
    const verificationId = randomCode(CERTIFICATE.verificationIdLength);
    const certificate = await tx.certificate.create({
      data: {
        certificateId: `${CERTIFICATE.prefix}-${randomCode(CERTIFICATE.randomLength)}`,
        verificationId,
        verificationUrl: `${branding.appUrl}${CERTIFICATE.verificationPath}/${verificationId}`,
        studentId: application.student.id,
        programId: application.program.id,
        applicationId: application.id,
        templateId: template?.id,
        status: "PENDING",
        snapshotStudentName: application.student.studentProfile?.fullName ?? application.student.name ?? "Student",
        snapshotProgramTitle: application.program.title,
        snapshotDomainName: application.program.domain.name,
        snapshotDuration: application.program.durationLabel,
        snapshotCollege: application.student.studentProfile?.college,
        taskScorePercent: scores.taskPercent,
        projectScorePercent: scores.projectPercent,
        overallScorePercent: scores.overallPercent,
        projectDifficulty: application.program.difficulty,
        completionDate: application.completedAt,
      },
    });
    await enqueueJob("CERTIFICATE_PDF", { certificateId: certificate.id }, { dedupeKey: `cert-pdf:${certificate.id}`, priority: 10 }, tx);
    return { certificate, released: true };
  });

  // Release generates the PDF immediately. The queued job remains as a retry path if
  // storage or PDF generation is temporarily unavailable.
  if (result.certificate.status === "PENDING") {
    try {
      await generateCertificate(result.certificate.id);
    } catch (error) {
      logger.error("[certificates] immediate generation failed; queued retry retained", {
        certificateId: result.certificate.certificateId,
        error: error instanceof Error ? error.message : "unknown",
      });
    } finally {
      kickJobs();
    }
  }

  const released = await prisma.certificate.findUniqueOrThrow({ where: { id: result.certificate.id } });
  if (result.released && released.status === "GENERATED") {
    await audit(actor, "CERTIFICATE_GENERATED", "Certificate", released.id, { releasedByAdmin: true, free: true });
  }
  return released;
}

/** Job handler. Idempotent: a certificate that already has a PDF is left alone. */
export async function generateCertificate(certificateRowId: string, options: { force?: boolean } = {}): Promise<void> {
  const force = options.force === true;
  const prisma = getPrisma();
  const cert = await prisma.certificate.findUnique({
    where: { id: certificateRowId },
    include: {
      student: { select: { id: true, email: true, name: true } },
      template: { select: { config: true, templateKey: true } },
    },
  });
  if (!cert) throw new NotFoundError("Certificate not found.");
  if (cert.status === "GENERATED" && cert.pdfFileId && !force) return;
  if (cert.status === "REVOKED") return;

  const branding = getBranding();
  const config = (cert.template?.config ?? {}) as { templateKey?: string };
  const issueDate = force ? cert.issueDate ?? new Date() : new Date();
  const disclaimer = await getSetting<string>("certificate_disclaimer", DEFAULT_DISCLAIMER);
  const bytes = await renderCertificatePdf({
    certificateId: cert.certificateId, verificationUrl: cert.verificationUrl, studentName: cert.snapshotStudentName,
    programTitle: cert.snapshotProgramTitle, domainName: cert.snapshotDomainName, duration: cert.snapshotDuration,
    completionDate: cert.completionDate, issueDate, companyName: branding.companyName,
    taskScorePercent: cert.taskScorePercent, projectScorePercent: cert.projectScorePercent, overallScorePercent: cert.overallScorePercent,
    disclaimer: (disclaimer || DEFAULT_DISCLAIMER).replaceAll("{{companyName}}", branding.companyName),
    difficulty: cert.projectDifficulty, templateKey: toTemplateKey(cert.template?.templateKey ?? config.templateKey),
  });
  const body = Buffer.from(bytes);
  const file = await saveUpload({
    purpose: "CERTIFICATE_PDF", ownerUserId: cert.studentId, originalName: `${cert.certificateId}.pdf`,
    mimeType: "application/pdf", body, checksumSha256: sha256Hex(body.toString("latin1")),
  });
  await prisma.fileAsset.update({ where: { id: file.id }, data: { scanStatus: "SKIPPED" } });

  const updated = await prisma.certificate.updateMany({
    where: { id: cert.id, status: force ? "GENERATED" : "PENDING" },
    data: { status: "GENERATED", pdfFileId: file.id, issueDate, generatedAt: issueDate },
  });
  if (updated.count === 0) return;

  if (!force) {
    await audit({ userId: null, role: "SYSTEM" }, "CERTIFICATE_GENERATED", "Certificate", cert.id, { certificateId: cert.certificateId });
    await notifyAndEmail({
      userId: cert.student.id, email: cert.student.email, recipientName: cert.student.name ?? "Student", type: "CERTIFICATE_ISSUED",
      title: "Your certificate is ready", body: `Certificate ${cert.certificateId} is available to view and download.`, link: "/student/certificate",
      templateKey: "certificate_issued", variables: { certificateId: cert.certificateId, verificationUrl: cert.verificationUrl },
    });
  }
}

/** Rebuild an already-issued PDF with the current layout while retaining its public ID. */
export async function regenerateCertificatePdf(actor: Actor, certificateRowId: string): Promise<void> {
  const certificate = await getPrisma().certificate.findUnique({ where: { id: certificateRowId }, select: { id: true, certificateId: true, status: true } });
  if (!certificate) throw new NotFoundError("Certificate not found.");
  if (certificate.status !== "GENERATED") throw new ConflictError("Only an already-issued certificate can be regenerated.");
  await generateCertificate(certificate.id, { force: true });
  await audit(actor, "CERTIFICATE_GENERATED", "Certificate", certificate.id, { certificateId: certificate.certificateId, regenerated: true });
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
