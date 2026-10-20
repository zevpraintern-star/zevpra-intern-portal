import { ForbiddenError } from "@/lib/api/errors";
import type { FilePurpose } from "@/generated/prisma/enums";
import { getPrisma } from "@/lib/db/prisma";

/**
 * A client may only attach files it uploaded itself, for the right purpose, that are
 * not deleted, not flagged by the scanner and not already attached elsewhere.
 * Without this check a student could attach another student's payment screenshot by
 * guessing its id (an IDOR).
 */
export async function assertAttachableFiles(
  userId: string,
  fileIds: string[],
  purposes: FilePurpose[],
): Promise<void> {
  if (fileIds.length === 0) return;
  const unique = [...new Set(fileIds)];
  const files = await getPrisma().fileAsset.findMany({
    where: { id: { in: unique } },
    select: {
      id: true, ownerUserId: true, purpose: true, deletedAt: true, scanStatus: true,
      _count: { select: { paymentScreenshots: true } },
    },
  });
  if (files.length !== unique.length) throw new ForbiddenError("One of the attached files is not available.");
  for (const file of files) {
    const attached = file._count.paymentScreenshots;
    if (file.ownerUserId !== userId || !purposes.includes(file.purpose) || file.deletedAt || file.scanStatus === "INFECTED" || attached > 0) {
      throw new ForbiddenError("One of the attached files is not available.");
    }
  }
}
