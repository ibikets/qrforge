import sharp from "sharp";

const MAX_SIDE = 2000;

/**
 * Server-side proof that a logo data URL really is a small PNG/JPEG/WebP (the regex only checks the label).
 * Rejects mislabelled files and oversized pixel dimensions before they reach the SVG renderer.
 */
export async function verifyLogo(dataUrl: string): Promise<boolean> {
  const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(dataUrl);
  if (!m) return false;
  try {
    const meta = await sharp(Buffer.from(m[2], "base64"), { limitInputPixels: MAX_SIDE * MAX_SIDE }).metadata();
    return meta.format === m[1] && (meta.width ?? 0) > 0 && (meta.width ?? 0) <= MAX_SIDE && (meta.height ?? 0) > 0 && (meta.height ?? 0) <= MAX_SIDE;
  } catch {
    return false;
  }
}
