import { z } from "zod";

import { ConflictError, ForbiddenError, NotFoundError, RateLimitError } from "@/lib/api/errors";
import { getBranding } from "@/lib/config/branding";
import { getPrisma } from "@/lib/db/prisma";
import { consumeRateLimit, rateLimits } from "@/lib/redis/rate-limit";
import { randomCode } from "@/lib/security/crypto";
import { CERTIFICATE } from "@/lib/config/constants";
import { paymentProofSchema, paymentReviewSchema } from "@/lib/validation/payment";
import { audit, securityEvent, type Actor } from "@/server/services/audit";
import { getOwnApplication } from "@/server/services/applications";
import { assertAttachableFiles } from "@/server/services/files";
import { notifyAndEmail } from "@/server/services/notifications";
import { getPaymentSettings } from "@/server/services/settings";
import { enqueueJob, kickJobs } from "@/server/jobs/queue";

/** What the student's payment page shows. Eligibility is decided here, never in the UI. */
export async function getPaymentView(studentId: string, applicationId: string) {
  const application = await getOwnApplication(studentId, applicationId);
  const eligible = application.completionStatus === "COMPLETED" && application.certificateEligibleAt !== null;
  const settings = await getPaymentSettings();
  const payment = eligible
    ? await getPrisma().paymentRequest.findUnique({
        where: { studentId_programId: { studentId, programId: application.programId } },
        include: { screenshots: { include: { file: { select: { id: true, originalName: true } } }, orderBy: { createdAt: "desc" } }, certificate: { select: { id: true, status: true } } },
      })
    : null;
  return {
    application, eligible, payment,
    amount: payment ? Number(payment.amount) : settings.fee,
    currency: payment?.currency ?? settings.currency,
    upiId: settings.upiId, payeeName: settings.payeeName, hasQr: Boolean(settings.qrFileId), instructions: settings.instructions,
  };
}

export function normaliseUtr(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

/**
 * Submitting proof NEVER produces a certificate. It only moves the request to
 * UNDER_REVIEW; a human with payments.review must approve it.
 */
export async function submitPaymentProof(studentId: string, input: z.infer<typeof paymentProofSchema>, actor: Actor) {
  const data = paymentProofSchema.parse(input);
  const limit = await consumeRateLimit(rateLimits.paymentProof(studentId));
  if (!limit.allowed) throw new RateLimitError("Too many payment submissions. Please try again later.", limit.retryAfterSeconds);

  const application = await getOwnApplication(studentId, data.applicationId);
  if (application.completionStatus !== "COMPLETED" || !application.certificateEligibleAt) {
    throw new ForbiddenError("You can pay for your certificate after your project is approved.");
  }

  const prisma = getPrisma();
  const settings = await getPaymentSettings();
  const payment = await prisma.paymentRequest.upsert({
    where: { studentId_programId: { studentId, programId: application.programId } },
    update: {},
    create: { applicationId: application.id, studentId, programId: application.programId, amount: settings.fee, currency: settings.currency },
  });
  if (payment.status === "UNDER_REVIEW") throw new ConflictError("Your payment is already under review.");
  if (payment.status === "APPROVED") throw new ConflictError("Your payment was already approved.");

  const utr = normaliseUtr(data.utr);
  const clash = await prisma.paymentRequest.findFirst({ where: { utr, id: { not: payment.id } }, select: { id: true } });
  if (clash) {
    await securityEvent("REPEATED_PAYMENT_SUBMISSION", "HIGH", { userId: studentId, ipAddress: actor.ipAddress, detail: { reason: "duplicate_utr" } });
    throw new ConflictError("This UTR was already used for another payment. Check the transaction ID and try again.");
  }

  await assertAttachableFiles(studentId, [data.screenshotFileId], ["PAYMENT_SCREENSHOT"]);

  try {
    await prisma.$transaction(async (tx) => {
      const moved = await tx.paymentRequest.updateMany({
        where: { id: payment.id, status: { in: ["NOT_SUBMITTED", "REJECTED"] } },
        data: {
          status: "UNDER_REVIEW", utr, payerName: data.payerName, upiIdUsed: data.upiIdUsed ?? settings.upiId, remarks: data.remarks,
          submittedAt: new Date(), reviewedAt: null, reviewedById: null, rejectionReason: null, submissionCount: { increment: 1 },
        },
      });
      if (moved.count === 0) throw new ConflictError("Your payment is already being processed.");
      await tx.paymentScreenshot.updateMany({ where: { paymentRequestId: payment.id }, data: { isPrimary: false } });
      await tx.paymentScreenshot.create({ data: { paymentRequestId: payment.id, fileId: data.screenshotFileId, isPrimary: true } });
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") throw new ConflictError("This UTR was already used for another payment.");
    throw error;
  }

  if (payment.submissionCount >= 2) {
    await securityEvent("REPEATED_PAYMENT_SUBMISSION", "MEDIUM", { userId: studentId, ipAddress: actor.ipAddress, detail: { submissions: payment.submissionCount + 1 } });
  }
  await audit(actor, "PAYMENT_SUBMITTED", "PaymentRequest", payment.id, { utrLast4: utr.slice(-4) });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: studentId }, select: { email: true, name: true } });
  await notifyAndEmail({
    userId: studentId, email: user.email, recipientName: user.name ?? "Student", type: "PAYMENT_SUBMITTED",
    title: "Payment under review", body: "Your certificate payment is under review. We'll notify you after it is verified.", link: "/student/payment",
    templateKey: "payment_submitted", variables: { utr, certificateFee: `${settings.currency} ${Number(payment.amount)}` },
  });
  return { paymentId: payment.id };
}

function newCertificateId(): string {
  return `${CERTIFICATE.prefix}-${randomCode(CERTIFICATE.randomLength)}`;
}

/**
 * Approve or reject a payment.
 *
 * Approval runs in ONE transaction: the guarded status flip (UNDER_REVIEW -> APPROVED)
 * is what prevents double processing; the certificate row and its PDF job are created
 * in the same commit, so there can never be an approved payment without a certificate
 * or two certificates for one payment (payment_request_id is also UNIQUE).
 */
export async function reviewPayment(actor: Actor, input: z.infer<typeof paymentReviewSchema>) {
  const data = paymentReviewSchema.parse(input);
  const prisma = getPrisma();
  const payment = await prisma.paymentRequest.findUnique({
    where: { id: data.paymentRequestId },
    include: {
      student: { select: { id: true, email: true, name: true, studentProfile: { select: { fullName: true, college: true } } } },
      program: { select: { id: true, title: true, durationLabel: true, domain: { select: { name: true } } } },
      application: { select: { id: true, completedAt: true } },
    },
  });
  if (!payment) throw new NotFoundError("Payment not found.");

  if (data.decision === "REJECTED") {
    const moved = await prisma.paymentRequest.updateMany({
      where: { id: payment.id, status: "UNDER_REVIEW" },
      data: { status: "REJECTED", rejectionReason: data.reason, reviewedById: actor.userId ?? null, reviewedAt: new Date() },
    });
    if (moved.count === 0) throw new ConflictError("This payment was already reviewed.");
    await audit(actor, "PAYMENT_REJECTED", "PaymentRequest", payment.id, { reason: data.reason });
    await notifyAndEmail({
      userId: payment.student.id, email: payment.student.email, recipientName: payment.student.name ?? "Student", type: "PAYMENT_REJECTED",
      title: "Payment could not be verified", body: `Reason: ${data.reason}. You can submit a new proof.`, link: "/student/payment",
      templateKey: "payment_rejected", variables: { reason: data.reason ?? "" },
    });
    return { certificateId: null };
  }

  const branding = getBranding();
  const profile = payment.student.studentProfile;
  const certificate = await prisma.$transaction(async (tx) => {
    const moved = await tx.paymentRequest.updateMany({
      where: { id: payment.id, status: "UNDER_REVIEW" },
      data: { status: "APPROVED", reviewedById: actor.userId ?? null, reviewedAt: new Date(), rejectionReason: null },
    });
    if (moved.count === 0) throw new ConflictError("This payment was already reviewed.");

    const template = await tx.certificateTemplate.findFirst({ where: { isActive: true }, orderBy: { version: "desc" }, select: { id: true } });
    const verificationId = randomCode(CERTIFICATE.verificationIdLength);
    const row = await tx.certificate.create({
      data: {
        certificateId: newCertificateId(), verificationId,
        verificationUrl: `${branding.appUrl}${CERTIFICATE.verificationPath}/${verificationId}`,
        studentId: payment.student.id, programId: payment.program.id, applicationId: payment.application.id, paymentRequestId: payment.id,
        templateId: template?.id, status: "PENDING",
        snapshotStudentName: profile?.fullName ?? payment.student.name ?? "Student",
        snapshotProgramTitle: payment.program.title, snapshotDomainName: payment.program.domain.name,
        snapshotDuration: payment.program.durationLabel, snapshotCollege: profile?.college,
        completionDate: payment.application.completedAt,
      },
    });
    await enqueueJob("CERTIFICATE_PDF", { certificateId: row.id }, { dedupeKey: `cert-pdf:${row.id}`, priority: 10 }, tx);
    return row;
  });

  await audit(actor, "PAYMENT_APPROVED", "PaymentRequest", payment.id, { certificateId: certificate.certificateId });
  await notifyAndEmail({
    userId: payment.student.id, email: payment.student.email, recipientName: payment.student.name ?? "Student", type: "PAYMENT_APPROVED",
    title: "Payment approved", body: "Your payment was verified. Your certificate is being generated.", link: "/student/certificate",
    templateKey: "payment_approved", variables: { certificateId: certificate.certificateId },
  });
  kickJobs();
  return { certificateId: certificate.id };
}
