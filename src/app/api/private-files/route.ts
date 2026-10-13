import { NextResponse } from "next/server";

import { ForbiddenError, NotFoundError } from "@/lib/api/errors";
import { route } from "@/lib/api/handler";
import { getPrisma } from "@/lib/db/prisma";
import { getStorageProvider, verifyLocalSignedUrl } from "@/lib/storage/storage-service";

/** Streams a locally stored file for a valid signed URL (S3 deployments use presigned URLs instead). */
export const GET = route(async (req) => {
  const params = new URL(req.url).searchParams;
  const key = params.get("key") ?? "";
  if (!key || !verifyLocalSignedUrl(key, params.get("expires") ?? "", params.get("signature") ?? "")) throw new ForbiddenError("This link has expired.");
  const asset = await getPrisma().fileAsset.findFirst({ where: { storageKey: key, deletedAt: null }, select: { id: true, mimeType: true, originalName: true } });
  if (!asset) throw new NotFoundError("File not found.");
  const body = await getStorageProvider().get(key);
  await getPrisma().fileAsset.update({ where: { id: asset.id }, data: { downloadCount: { increment: 1 } } });
  const inline = asset.mimeType.startsWith("image/") || asset.mimeType === "application/pdf";
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": asset.mimeType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${asset.originalName.replace(/[^\w.-]/g, "_")}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
    },
  });
});
