import sharp from "sharp";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_PIXELS = 24_000_000;
export type Crop = { cx: number; cy: number; zoom: number };
export type Processed = { main: Buffer; mime: "image/webp"; width: number; height: number; vcf: Buffer | null };
export class MediaError extends Error {}

export function parseCrop(raw: unknown): Crop {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const n = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return { cx: Math.min(Math.max(n(o.cx, 0.5), 0), 1), cy: Math.min(Math.max(n(o.cy, 0.5), 0), 1), zoom: Math.min(Math.max(n(o.zoom, 1), 1), 4) };
}

/**
 * Judge the file by its content (never name or declared type): PNG / JPEG / WebP only, single frame, bounded pixels.
 * The image is decoded and re-encoded, which removes EXIF (including location), ICC oddities and any appended data.
 * Portrait: square crop chosen by the user (centre + zoom), 512px WebP, plus a 192px JPEG used only in the contact file.
 * Logo: fitted inside 512x512 without cropping, transparency kept.
 */
export async function processImage(input: Buffer, kind: "portrait" | "logo", crop: Crop): Promise<Processed> {
  try {
    const first = await sharp(input, { limitInputPixels: MAX_PIXELS, failOn: "error" }).metadata();
    if (first.format !== "png" && first.format !== "jpeg" && first.format !== "webp") throw new MediaError("Use a PNG, JPEG or WebP image. SVG and other formats are not accepted.");
    if ((first.pages ?? 1) > 1) throw new MediaError("Animated images are not accepted. Use a single still image.");
    if (!first.width || !first.height || first.width < 64 || first.height < 64) throw new MediaError("The image is too small. Use one at least 64 pixels on each side.");
    // upright pixels (EXIF orientation applied, then discarded)
    const upright = await sharp(input, { limitInputPixels: MAX_PIXELS, failOn: "error" }).rotate().toBuffer({ resolveWithObject: true });
    const w = upright.info.width, h = upright.info.height;
    if (kind === "portrait") {
      const side = Math.max(32, Math.floor(Math.min(w, h) / crop.zoom));
      const left = Math.round(Math.min(Math.max(crop.cx * w - side / 2, 0), w - side));
      const top = Math.round(Math.min(Math.max(crop.cy * h - side / 2, 0), h - side));
      const sq = sharp(upright.data).extract({ left, top, width: side, height: side });
      const main = await sq.clone().resize(512, 512, { fit: "cover" }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
      const vcf = await sq.clone().resize(192, 192, { fit: "cover" }).flatten({ background: "#ffffff" }).jpeg({ quality: 78, mozjpeg: true }).toBuffer();
      return { main: main.data, mime: "image/webp", width: main.info.width, height: main.info.height, vcf };
    }
    const main = await sharp(upright.data).resize(512, 512, { fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
    return { main: main.data, mime: "image/webp", width: main.info.width, height: main.info.height, vcf: null };
  } catch (e) {
    if (e instanceof MediaError) throw e;
    throw new MediaError("That file could not be read as a valid image.");
  }
}

/** A stored static-contact photo must really be a small JPEG (the browser's claim is not trusted). */
export async function verifyContactPhoto(b64: string): Promise<boolean> {
  try {
    const m = await sharp(Buffer.from(b64, "base64"), { limitInputPixels: 256 * 256, failOn: "error" }).metadata();
    return m.format === "jpeg" && (m.width ?? 0) >= 16 && (m.width ?? 0) <= 256 && (m.height ?? 0) >= 16 && (m.height ?? 0) <= 256;
  } catch {
    return false;
  }
}

/**
 * Gallery / cover image: PNG, JPEG or WebP judged by content, single frame, bounded pixels. Decoded and re-encoded (EXIF, location and
 * appended data removed), fitted inside 1600px as WebP, plus a 480px WebP thumbnail used by grids. Never cropped, transparency kept.
 */
export async function processGalleryImage(input: Buffer): Promise<{ main: Buffer; thumb: Buffer; width: number; height: number }> {
  try {
    const first = await sharp(input, { limitInputPixels: MAX_PIXELS, failOn: "error" }).metadata();
    if (first.format !== "png" && first.format !== "jpeg" && first.format !== "webp") throw new MediaError("Use a PNG, JPEG or WebP image. SVG and other formats are not accepted.");
    if ((first.pages ?? 1) > 1) throw new MediaError("Animated images are not accepted. Use a single still image.");
    if (!first.width || !first.height || first.width < 64 || first.height < 64) throw new MediaError("The image is too small. Use one at least 64 pixels on each side.");
    const upright = await sharp(input, { limitInputPixels: MAX_PIXELS, failOn: "error" }).rotate().toBuffer();
    const main = await sharp(upright).resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
    const thumb = await sharp(upright).resize(480, 480, { fit: "inside", withoutEnlargement: true }).webp({ quality: 74 }).toBuffer();
    return { main: main.data, thumb, width: main.info.width, height: main.info.height };
  } catch (e) {
    if (e instanceof MediaError) throw e;
    throw new MediaError("That file could not be read as a valid image.");
  }
}
