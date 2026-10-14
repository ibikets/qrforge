import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { adm } from "@/lib/admin/db";
import { writeAudit } from "@/lib/admin/audit";
import { authorise } from "@/lib/admin/guard";
import { ASSET_BUCKET } from "@/lib/content";

const MAX_BYTES = 2 * 1024 * 1024;
const EXT = { png: "png", jpeg: "jpg", webp: "webp" } as const;
const MIME = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" } as const;
const no = (status: number, error: string, field?: string) => Response.json({ error, ...(field ? { field } : {}) }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Image upload. Only PNG, JPEG and WebP are accepted, judged by the file's real content (never its name or declared type).
 * SVG is refused outright. The image is decoded and re-encoded, which removes embedded metadata and any appended data,
 * and the stored name is generated here. Nothing from the browser decides where the file is stored.
 */
export async function POST(req: Request) {
  const gate = await authorise(req, "media.manage", "asset-upload", 20);
  if ("response" in gate) return gate.response;
  const { staff } = gate;
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES + 20_000) return no(413, "That file is too large. The limit is 2 MB.", "file");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return no(400, "Invalid request.");
  }
  const file = form.get("file");
  const alt = typeof form.get("alt") === "string" ? (form.get("alt") as string).trim() : "";
  if (!(file instanceof File)) return no(422, "Choose an image file.", "file");
  if (file.size < 1 || file.size > MAX_BYTES) return no(413, "That file is too large. The limit is 2 MB.", "file");
  // eslint-disable-next-line no-control-regex
  if (alt.length < 5 || alt.length > 200 || /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(alt)) return no(422, "Describe the image in 5 to 200 characters of plain text (for people who cannot see it).", "alt");

  const input = Buffer.from(await file.arrayBuffer());
  let fmt: keyof typeof EXT;
  let out: { data: Buffer; width: number; height: number };
  try {
    const meta = await sharp(input, { limitInputPixels: 16_000_000, failOn: "error" }).metadata();
    if (meta.format !== "png" && meta.format !== "jpeg" && meta.format !== "webp") return no(422, "Only PNG, JPEG or WebP images are accepted. SVG and other formats are not allowed.", "file");
    fmt = meta.format;
    if (!meta.width || !meta.height || meta.width < 16 || meta.height < 16 || meta.width > 4000 || meta.height > 4000) return no(422, "The image must be between 16 and 4000 pixels on each side.", "file");
    const pipeline = sharp(input, { limitInputPixels: 16_000_000, failOn: "error" }).rotate();
    const buf = await (fmt === "png" ? pipeline.png() : fmt === "jpeg" ? pipeline.jpeg({ quality: 88 }) : pipeline.webp({ quality: 88 })).toBuffer({ resolveWithObject: true });
    out = { data: buf.data, width: buf.info.width, height: buf.info.height };
  } catch {
    return no(422, "That file could not be read as a valid image.", "file");
  }
  if (out.data.length > MAX_BYTES) return no(413, "That image is too large after processing. Use a smaller image.", "file");

  const id = randomUUID();
  const path = `${id}.${EXT[fmt]}`;
  const db = adm();
  const up = await db.storage.from(ASSET_BUCKET).upload(path, out.data, { contentType: MIME[fmt], upsert: false, cacheControl: "31536000" });
  if (up.error) return no(502, "The image could not be stored. Nothing was saved. Try again.");
  const ins = await db.from("content_assets").insert({ id, path, mime: MIME[fmt], bytes: out.data.length, width: out.width, height: out.height, alt, uploaded_by: staff.userId }).select("id").single();
  if (ins.error) {
    await db.storage.from(ASSET_BUCKET).remove([path]);
    return no(502, "The image could not be recorded. Nothing was saved. Try again.");
  }
  const audited = await writeAudit(staff, { action: "asset.uploaded", targetType: "asset", targetId: id, after: { path, bytes: out.data.length, width: out.width, height: out.height } });
  if (!audited) return Response.json({ error: "The image was saved but its audit record could not be written. Tell the Owner.", code: "audit_failed", id }, { status: 500 });
  return Response.json({ ok: true, id, path }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
