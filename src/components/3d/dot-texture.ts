import { CanvasTexture, SRGBColorSpace } from "three";

let cached: CanvasTexture | null = null;

/**
 * Soft round sprite shared by every point cloud. Without it, WebGL draws points as
 * hard squares, which looks cheap and turns into a solid block when one passes close
 * to the camera.
 */
export function getDotTexture(): CanvasTexture {
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.3, "rgba(255,255,255,0.9)");
    gradient.addColorStop(0.65, "rgba(255,255,255,0.25)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
  }
  cached = new CanvasTexture(canvas);
  cached.colorSpace = SRGBColorSpace;
  return cached;
}
