import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { ForbiddenError, PayloadTooLargeError, RateLimitError, UnauthenticatedError, UnsupportedMediaTypeError, ValidationError } from "@/lib/api/errors";
import { route } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/response";
import { can, loadStaffContext } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/config/env";
import { consumeRateLimit, rateLimits } from "@/lib/redis/rate-limit";
import { extensionMatches, sniffMime } from "@/lib/security/file-scan";
import { saveUpload, validateUpload, type FilePurpose } from "@/lib/storage/storage-service";
import { securityEvent } from "@/server/services/audit";
import { enqueueJob, kickJobs } from "@/server/jobs/queue";

// Task 3: submissions and profiles are links only. The ONLY student upload left is
// the payment screenshot; staff may upload the payment QR. Every other purpose is
// rejected here even if a valid FilePurpose enum value is supplied.
const STUDENT_PURPOSES: FilePurpose[] = ["PAYMENT_SCREENSHOT"];
const STAFF_PURPOSES: Partial<Record<FilePurpose, string>> = { PAYMENT_QR: "settings.manage" };

export const POST = route(async (req, _ctx, meta) => {
  const env = getEnv();
  const maxBytes = env.MAX_UPLOAD_SIZE_MB * 1024 * 1024;
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBytes + 64 * 1024) throw new PayloadTooLargeError(`The file exceeds the ${env.MAX_UPLOAD_SIZE_MB} MB upload limit.`);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const purpose = String(form?.get("purpose") ?? "") as FilePurpose;
  if (!form || !(file instanceof File)) throw new ValidationError("Choose a file to upload.");

  // Who is uploading, and for which purpose?
  const student = await getSession("STUDENT");
  const adminSession = student ? null : await getSession("ADMIN");
  let ownerId: string;
  if (STAFF_PURPOSES[purpose]) {
    if (!adminSession) throw new UnauthenticatedError();
    const staff = await loadStaffContext(adminSession);
    if (!staff || !can(staff, STAFF_PURPOSES[purpose] as string)) throw new ForbiddenError();
    ownerId = staff.userId;
  } else if (STUDENT_PURPOSES.includes(purpose)) {
    if (!student) throw new UnauthenticatedError();
    ownerId = student.user.id;
  } else {
    throw new ValidationError("Unsupported upload type.");
  }

  const limit = await consumeRateLimit(rateLimits.upload(ownerId));
  if (!limit.allowed) throw new RateLimitError("Too many uploads. Please wait a moment.", limit.retryAfterSeconds);

  const body = Buffer.from(await file.arrayBuffer());
  const { extension } = validateUpload({ originalName: file.name, mimeType: file.type, sizeBytes: body.byteLength });

  // Payment screenshots are compressed in the browser before upload; the server still
  // enforces a hard cap so an uncompressed/forged upload can never slip through.
  if (purpose === "PAYMENT_SCREENSHOT" && body.byteLength > env.MAX_PAYMENT_SCREENSHOT_KB * 1024) {
    throw new PayloadTooLargeError(`Payment screenshots must be under ${env.MAX_PAYMENT_SCREENSHOT_KB} KB after compression.`);
  }

  // The declared type and extension are attacker-controlled: trust only the bytes.
  const sniffed = sniffMime(body);
  if (!sniffed || sniffed !== file.type || !extensionMatches(sniffed, extension)) {
    await securityEvent("MALICIOUS_FILE_ATTEMPT", "HIGH", { userId: ownerId, ipAddress: meta.ipAddress, userAgent: meta.userAgent, detail: { declared: file.type, sniffed, name: file.name.slice(0, 80) } });
    throw new UnsupportedMediaTypeError("The file contents do not match its type.");
  }
  if (purpose === "PAYMENT_QR" && !sniffed.startsWith("image/")) throw new UnsupportedMediaTypeError("The QR code must be an image.");

  const asset = await saveUpload({ purpose, ownerUserId: ownerId, originalName: file.name, mimeType: sniffed, body, checksumSha256: createHash("sha256").update(body).digest("hex") });
  await enqueueJob("FILE_SCAN", { fileId: asset.id }, { dedupeKey: `scan:${asset.id}` });
  kickJobs();
  return apiSuccess({ fileId: asset.id, name: asset.originalName, size: asset.sizeBytes }, { status: 201 }) as NextResponse;
});
