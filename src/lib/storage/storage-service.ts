import { createHmac, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";

import { getEnv } from "../config/env";
import { UPLOAD_RULES } from "../config/constants";
import { getPrisma } from "../db/prisma";
import { PayloadTooLargeError, UnsupportedMediaTypeError } from "../api/errors";

/**
 * Private object storage abstraction.
 *
 * Every uploaded document (resume, project file, payment screenshot, certificate
 * PDF, UPI QR code) lives in private storage. Nothing is ever served from a public
 * path: a caller must pass an authorization check and then receive a short-lived
 * signed URL. See docs/SECURITY.md -> "File handling".
 *
 * Drivers
 *  - "s3"    : Amazon S3 or Cloudflare R2 (production).
 *  - "local" : filesystem driver for development only; the environment schema
 *              refuses it when NODE_ENV=production.
 */

export type FilePurpose =
  | "RESUME"
  | "PAYMENT_SCREENSHOT"
  | "TASK_SUBMISSION"
  | "PROJECT_FILE"
  | "PROJECT_SCREENSHOT"
  | "CERTIFICATE_PDF"
  | "PAYMENT_QR"
  | "CERTIFICATE_TEMPLATE"
  | "AVATAR";

const PURPOSE_PREFIX: Record<FilePurpose, string> = {
  RESUME: "resumes",
  PAYMENT_SCREENSHOT: "payment-screenshots",
  TASK_SUBMISSION: "task-submissions",
  PROJECT_FILE: "project-files",
  PROJECT_SCREENSHOT: "project-screenshots",
  CERTIFICATE_PDF: "certificates",
  PAYMENT_QR: "branding",
  CERTIFICATE_TEMPLATE: "certificate-templates",
  AVATAR: "avatars",
};

export interface UploadCandidate {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Validates an upload before anything is written. Checks size, declared MIME type,
 * the extension allow-list and rejects double extensions and path traversal.
 */
export function validateUpload(candidate: UploadCandidate): { extension: string } {
  const env = getEnv();
  const maxBytes = env.MAX_UPLOAD_SIZE_MB * 1024 * 1024;

  if (candidate.sizeBytes <= 0) {
    throw new UnsupportedMediaTypeError("The uploaded file is empty.");
  }
  if (candidate.sizeBytes > maxBytes) {
    throw new PayloadTooLargeError(
      `The file exceeds the ${env.MAX_UPLOAD_SIZE_MB} MB upload limit.`,
    );
  }

  const rawName = candidate.originalName.trim();
  if (
    rawName.length === 0 ||
    rawName.length > 255 ||
    rawName.includes("/") ||
    rawName.includes("\\") ||
    rawName.includes("\0")
  ) {
    throw new UnsupportedMediaTypeError("The file name is not allowed.");
  }

  const extension = extname(rawName).toLowerCase();
  if (!(UPLOAD_RULES.allowedExtensions as readonly string[]).includes(extension)) {
    throw new UnsupportedMediaTypeError(
      `Allowed file types: ${UPLOAD_RULES.allowedExtensions.join(", ")}.`,
    );
  }
  if ((UPLOAD_RULES.blockedExtensions as readonly string[]).includes(extension)) {
    throw new UnsupportedMediaTypeError("Executable and script files cannot be uploaded.");
  }
  if (!(UPLOAD_RULES.allowedMimeTypes as readonly string[]).includes(candidate.mimeType)) {
    throw new UnsupportedMediaTypeError("The declared file type is not allowed.");
  }
  // Guards against "invoice.pdf.exe" style names that browsers may still execute.
  const baseName = rawName.slice(0, rawName.length - extension.length);
  if (baseName.includes(".")) {
    const innerExtension = extname(baseName).toLowerCase();
    if ((UPLOAD_RULES.blockedExtensions as readonly string[]).includes(innerExtension)) {
      throw new UnsupportedMediaTypeError("Double extensions are not allowed.");
    }
  }

  return { extension };
}

/** Randomised storage key: purpose/yyyy/mm/owner/random.ext (never the original name). */
export function buildStorageKey(
  purpose: FilePurpose,
  ownerUserId: string | null,
  extension: string,
  now: Date = new Date(),
): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const owner = ownerUserId ?? "shared";
  return `${PURPOSE_PREFIX[purpose]}/${year}/${month}/${owner}/${randomUUID()}${extension}`;
}

interface StorageObject {
  key: string;
  body: Buffer;
  contentType: string;
}

export interface StorageProvider {
  readonly name: string;
  put(object: StorageObject): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  /** Time-limited direct download URL (S3 presigned URL). */
  signedUrl(key: string, ttlSeconds: number): Promise<string>;
}

/** Development filesystem driver. Refused in production by the environment schema. */
class LocalStorageProvider implements StorageProvider {
  readonly name = "local";
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private resolveKey(key: string): string {
    const target = resolve(join(this.root, key));
    if (target !== this.root && !target.startsWith(this.root + sep)) {
      // Path traversal attempt: refuse rather than write outside the root.
      throw new Error("Invalid storage key.");
    }
    return target;
  }

  async put(object: StorageObject): Promise<void> {
    const target = this.resolveKey(object.key);
    await mkdir(resolve(target, ".."), { recursive: true });
    await writeFile(target, object.body);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolveKey(key));
  }

  async remove(key: string): Promise<void> {
    const target = this.resolveKey(key);
    if (existsSync(target)) {
      await rm(target, { force: true });
    }
  }

  async signedUrl(key: string, ttlSeconds: number): Promise<string> {
    // Local development has no object-storage signing, so a keyed token is issued
    // for the private file route which performs the same authorization checks.
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    const env = getEnv();
    const signature = createHmac("sha256", env.SESSION_SECRET)
      .update(`${key}:${expiresAt}`)
      .digest("base64url");
    return `/api/private-files?key=${encodeURIComponent(key)}&expires=${expiresAt}&signature=${signature}`;
  }
}

/** Amazon S3 / Cloudflare R2 driver. SDKs are imported lazily to keep cold starts small. */
class S3StorageProvider implements StorageProvider {
  readonly name = "s3";
  private static clientPromise: Promise<unknown> | null = null;

  private async getClient(): Promise<{
    send: (command: unknown) => Promise<unknown>;
  }> {
    if (!S3StorageProvider.clientPromise) {
      const env = getEnv();
      S3StorageProvider.clientPromise = import("@aws-sdk/client-s3").then(
        ({ S3Client }) =>
          new S3Client({
            region: env.STORAGE_REGION,
            endpoint: env.STORAGE_ENDPOINT,
            forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
            credentials: {
              accessKeyId: env.STORAGE_ACCESS_KEY ?? "",
              secretAccessKey: env.STORAGE_SECRET_KEY ?? "",
            },
          }),
      );
    }
    return (await S3StorageProvider.clientPromise) as {
      send: (command: unknown) => Promise<unknown>;
    };
  }

  async put(object: StorageObject): Promise<void> {
    const env = getEnv();
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.getClient();
    await client.send(
      new PutObjectCommand({
        Bucket: env.STORAGE_BUCKET,
        Key: object.key,
        Body: object.body,
        ContentType: object.contentType,
        // Objects are private: access is only ever granted through a signed URL.
        ACL: "private",
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const env = getEnv();
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.getClient();
    const response = (await client.send(
      new GetObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }),
    )) as { Body?: { transformToByteArray?: () => Promise<Uint8Array> } };

    const bytes = await response.Body?.transformToByteArray?.();
    if (!bytes) throw new Error("Stored object could not be read.");
    return Buffer.from(bytes);
  }

  async remove(key: string): Promise<void> {
    const env = getEnv();
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.getClient();
    await client.send(new DeleteObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }));
  }

  async signedUrl(key: string, ttlSeconds: number): Promise<string> {
    const env = getEnv();
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const client = await this.getClient();
    return getSignedUrl(
      client as never,
      new GetObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }),
      { expiresIn: ttlSeconds },
    );
  }
}

let provider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (provider) return provider;
  const env = getEnv();
  provider = env.STORAGE_DRIVER === "s3" ? new S3StorageProvider() : new LocalStorageProvider(env.STORAGE_LOCAL_ROOT);
  return provider;
}

/** Test helper. */
export function resetStorageProvider(): void {
  provider = null;
}

type PrismaClientInstance = ReturnType<typeof getPrisma>;

/** Row shape returned by the FileAsset table. */
export type FileAssetRecord = Awaited<ReturnType<PrismaClientInstance["fileAsset"]["create"]>>;

export interface SaveUploadInput {
  purpose: FilePurpose;
  ownerUserId: string | null;
  originalName: string;
  mimeType: string;
  body: Buffer;
  checksumSha256?: string;
}

/**
 * Validates, stores and registers an upload.
 *
 * The original file name is never used as the storage key, and the extension is
 * taken from the validated name rather than from the client-provided MIME type.
 */
export async function saveUpload(input: SaveUploadInput): Promise<FileAssetRecord> {
  const env = getEnv();
  const { extension } = validateUpload({
    originalName: input.originalName,
    mimeType: input.mimeType,
    sizeBytes: input.body.byteLength,
  });

  const storageKey = buildStorageKey(input.purpose, input.ownerUserId, extension);
  const storage = getStorageProvider();
  await storage.put({ key: storageKey, body: input.body, contentType: input.mimeType });

  return getPrisma().fileAsset.create({
    data: {
      ownerUserId: input.ownerUserId,
      purpose: input.purpose,
      storageDriver: storage.name,
      bucket: env.STORAGE_BUCKET ?? null,
      storageKey,
      originalName: input.originalName.slice(0, 255),
      mimeType: input.mimeType,
      extension,
      sizeBytes: input.body.byteLength,
      checksumSha256: input.checksumSha256 ?? null,
      isPrivate: true,
      // Malware scanning runs asynchronously (JobType.FILE_SCAN, Phase 10).
      scanStatus: "PENDING",
    },
  });
}

export async function loadPrivateFile(
  fileId: string,
): Promise<{ asset: FileAssetRecord; body: Buffer }> {
  const asset = await getPrisma().fileAsset.findFirst({
    where: { id: fileId, deletedAt: null },
  });
  if (!asset) {
    throw new Error("File not found.");
  }
  const body = await getStorageProvider().get(asset.storageKey);
  return { asset, body };
}

/**
 * Issues a short-lived download URL. Callers must have already performed an
 * authorization check (owner or authorised admin) before calling this.
 */
export async function createSignedDownloadUrl(
  fileId: string,
  ttlSeconds?: number,
): Promise<string> {
  const env = getEnv();
  const asset = await getPrisma().fileAsset.findFirst({ where: { id: fileId, deletedAt: null } });
  if (!asset) throw new Error("File not found.");

  return getStorageProvider().signedUrl(asset.storageKey, ttlSeconds ?? env.SIGNED_URL_TTL_SECONDS);
}

/** Soft-deletes the registry row; the object is removed from storage asynchronously. */
export async function deleteFileAsset(fileId: string): Promise<void> {
  await getPrisma().fileAsset.update({
    where: { id: fileId },
    data: { deletedAt: new Date() },
  });
}

/** Verifies the token issued by the local development driver. */
export function verifyLocalSignedUrl(
  key: string,
  expires: string,
  signature: string,
): boolean {
  const env = getEnv();
  const expiresAt = Number.parseInt(expires, 10);
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 < Date.now()) return false;

  const expected = createHmac("sha256", env.SESSION_SECRET)
    .update(`${key}:${expiresAt}`)
    .digest("base64url");

  return expected === signature;
}
