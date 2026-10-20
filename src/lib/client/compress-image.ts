/** Browser-only image compression for upload flows.

  * Resizes a chosen image to `maxDimension` pixels on its longest side and encodes
  * it, dropping the quality until the payload is under `maxSizeBytes`.
  *
  * The result is a `File` whose name and type always match the bytes that were
  * actually produced: the server rejects any mismatch between the declared MIME
  * type, the file extension and the sniffed content, so returning the original
  * `file.name` (e.g. "shot.png") next to WebP bytes would fail validation.
  *
  * WebP is preferred, but some older Safari builds ignore the `toBlob` type
  * argument and hand back a PNG (or a blob with an empty type). When that happens
  * we fall back to JPEG and give the file a `.jpg` extension.
  *
  * This module is a client module: it uses `createImageBitmap` and the DOM canvas
  * APIs and must never be imported by a server component or shared code path.
  */

export interface CompressImageOptions {
  /** Longest side in pixels. Most phone photos are far larger than this. */
  maxDimension?: number;
  /** Target payload in bytes (~150 KB). */
  maxSizeBytes?: number;
  /** Initial quality. Lowered automatically if the size target is missed. */
  quality?: number;
}

export interface CompressedImage {
  /** The file to upload: name and type match the encoded bytes. */
  file: File;
  /** Final MIME type actually produced ("image/webp" or "image/jpeg"). */
  type: string;
  /** Final extension (".webp" or ".jpg"), matching `type`. */
  extension: string;
  /** Encoded size in bytes. */
  bytes: number;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

function replaceExtension(name: string, extension: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return base + extension;
}

function encodeCanvas(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob?.((candidate) => resolve(candidate), type, quality);
  });
}

/** Only image files are compressed. Everything else (PDF, etc.) is sent as-is. */
export async function compressImageFile(
  file: File,
  options: CompressImageOptions = {},
): Promise<CompressedImage> {
  const maxDimension = options.maxDimension ?? 1280;
  const maxSizeBytes = options.maxSizeBytes ?? 150 * 1024;
  const baseQuality = options.quality ?? 0.86;

  if (!file.type.startsWith("image/")) {
    return { file, type: file.type, extension: extensionOf(file.name), bytes: file.size };
  }

  const bitmap = await createImageBitmap(file);
  try {
    const longSide = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, maxDimension / longSide);

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("The current browser does not support 2D canvas.");
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    // Probe WebP support. Older Safari ignores the type argument and returns a PNG
    // (or a blob with an empty type); fall back to JPEG in that case so the
    // extension and declared type always match the real bytes.
    let mime = "image/webp";
    let extension = ".webp";
    const probe = await encodeCanvas(canvas, "image/webp", baseQuality);
    if (!probe || probe.type !== "image/webp") {
      mime = "image/jpeg";
      extension = ".jpg";
    }

    let quality = baseQuality;
    let blob: Blob | null = probe && probe.type === mime ? probe : await encodeCanvas(canvas, mime, quality);
    // Lower quality a little at a time until the target size is met or quality
    // becomes so low that the file is essentially unusable.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (!blob || blob.size <= maxSizeBytes || quality <= 0.55) break;
      quality = Math.max(0.55, quality - 0.12);
      blob = await encodeCanvas(canvas, mime, quality);
    }

    if (!blob) {
      throw new Error("Could not encode the image.");
    }

    const out = new File([blob], replaceExtension(file.name, extension), { type: mime });
    return { file: out, type: mime, extension, bytes: out.size };
  } finally {
    bitmap.close();
  }
}

