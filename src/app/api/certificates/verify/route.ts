import { NextRequest } from "next/server";

import { NotFoundError, RateLimitError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { getPrisma } from "@/lib/db/prisma";
import { clientIpFromHeaders, consumeRateLimit, rateLimits } from "@/lib/redis/rate-limit";
import { certificateVerifyQuerySchema } from "@/lib/validation/certificate";

/**
 * Public certificate verification endpoint.
 *
 * Design notes
 *  - No authentication: anyone may verify a certificate they physically hold.
 *  - Rate limited per client IP (rateLimits.certificateVerify) to blunt
 *    enumeration of certificate ids.
 *  - Only certificates that are currently GENERATED and not revoked are
 *    returned. Missing, pending and revoked certificates all resolve to the
 *    same generic 404 so the response cannot be used to probe certificate
 *    state.
 *  - Returns only the immutable public snapshot fields. Internal ids, the
 *    student's account id and any live profile data are never exposed.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = certificateVerifyQuerySchema.parse({ id: searchParams.get("id") });

    const ip = clientIpFromHeaders(req.headers);
    const limit = await consumeRateLimit(rateLimits.certificateVerify(ip));
    if (!limit.allowed) {
      throw new RateLimitError(
        "Too many verification attempts. Please try again shortly.",
        limit.retryAfterSeconds,
      );
    }

    const certificate = await getPrisma().certificate.findUnique({
      where: { certificateId: parsed.id },
      select: {
        certificateId: true,
        snapshotStudentName: true,
        snapshotProgramTitle: true,
        snapshotDomainName: true,
        snapshotDuration: true,
        issueDate: true,
        status: true,
        revokedAt: true,
      },
    });

    const isPubliclyVerifiable =
      certificate !== null && certificate.status === "GENERATED" && certificate.revokedAt === null;

    if (!isPubliclyVerifiable) {
      throw new NotFoundError(
        "No active certificate matches that ID. Please check the code printed on your certificate.",
      );
    }

    return apiSuccess({
      certificate: {
        code: certificate.certificateId,
        studentName: certificate.snapshotStudentName,
        programTitle: certificate.snapshotProgramTitle,
        domainName: certificate.snapshotDomainName,
        duration: certificate.snapshotDuration,
        issuedAt: certificate.issueDate,
      },
    });
  } catch (error) {
    return apiFailure(error);
  }
}
