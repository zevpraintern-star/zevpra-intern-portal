import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Task 4: browser image compression. The server rejects any mismatch between the
 * declared MIME type, the file extension and the sniffed content, so the helper
 * must return a File whose name/type match the bytes it actually produced.
 *
 * These tests stub the browser-only globals (`createImageBitmap`, `document`) so
 * the logic runs under the Node test environment.
 */

interface RecordedEncode {
  type: string;
  quality: number;
}

let encodes: RecordedEncode[] = [];
/** When false, `toBlob` ignores the requested type and returns PNG (old Safari). */
let supportsWebp = true;
/** Encoded size in bytes for a given quality (drives the size-target loop). */
let sizeForQuality: (quality: number) => number = () => 100;

function installBrowserGlobals() {
  const bitmap = { width: 4000, height: 3000, close: vi.fn() };
  vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));

  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: vi.fn() }),
    toBlob: (callback: (blob: Blob | null) => void, type: string, quality: number) => {
      encodes.push({ type, quality });
      const produced = supportsWebp ? type : "image/png";
      const blob = new Blob([new Uint8Array(sizeForQuality(quality))], { type: produced });
      callback(blob);
    },
  };

  vi.stubGlobal("document", { createElement: () => canvas });
}

const importCompress = () => import("@/lib/client/compress-image").then((m) => m.compressImageFile);

function pngFile(name = "shot.png"): File {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: "image/png" });
}

describe("compressImageFile", () => {
  beforeEach(() => {
    encodes = [];
    supportsWebp = true;
    sizeForQuality = () => 100;
    installBrowserGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("produces a WebP file whose name and type match the bytes", async () => {
    const compress = await importCompress();
    const result = await compress(pngFile(), { maxDimension: 1280, maxSizeBytes: 150 * 1024 });

    expect(result.type).toBe("image/webp");
    expect(result.extension).toBe(".webp");
    expect(result.file.type).toBe("image/webp");
    expect(result.file.name).toBe("shot.webp");
    // The declared type always equals the produced type (server mismatch guard).
    expect(result.file.type).toBe(result.type);
  });

  it("falls back to JPEG with a .jpg extension when the browser will not encode WebP", async () => {
    supportsWebp = false; // toBlob hands back a PNG regardless of the requested type
    const compress = await importCompress();
    const result = await compress(pngFile(), { maxDimension: 1280, maxSizeBytes: 150 * 1024 });

    expect(result.type).toBe("image/jpeg");
    expect(result.extension).toBe(".jpg");
    expect(result.file.type).toBe("image/jpeg");
    expect(result.file.name).toBe("shot.jpg");
    // The probe asked for webp, then the real encode asked for jpeg.
    expect(encodes[0].type).toBe("image/webp");
    expect(encodes[1].type).toBe("image/jpeg");
    expect(result.file.type).toBe(result.type);
  });

  it("passes non-image files through untouched", async () => {
    const compress = await importCompress();
    const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "doc.pdf", { type: "application/pdf" });
    const result = await compress(pdf);

    expect(result.file).toBe(pdf);
    expect(result.type).toBe("application/pdf");
    expect(result.extension).toBe(".pdf");
    expect(encodes).toHaveLength(0);
  });

  it("lowers quality until the size target is met", async () => {
    // Big at high quality, small once quality drops below 0.7.
    sizeForQuality = (q) => (q > 0.7 ? 500_000 : 100);
    const compress = await importCompress();
    const result = await compress(pngFile(), { maxDimension: 1280, maxSizeBytes: 150 * 1024 });

    // More than one encode happened (the probe plus at least one retry).
    expect(encodes.length).toBeGreaterThan(1);
    expect(result.bytes).toBeLessThanOrEqual(150 * 1024);
    expect(result.file.type).toBe(result.type);
  });
});
