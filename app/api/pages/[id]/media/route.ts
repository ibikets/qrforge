import { randomUUID } from "node:crypto";
import { adm } from "@/lib/admin/db";
import { MAX_UPLOAD_BYTES, MediaError, parseCrop, processImage } from "@/lib/pages/media";
import { PAGE_BUCKET, customer, jerr, ownedPage } from "@/lib/pages/server";

/**
 * Upload a portrait or logo. The browser sends the original plus the crop it chose; everything else is decided here:
 * content inspection, EXIF removal, re-encoding, size, storage path. Stored in a private bucket; nothing is public until published.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await customer(req, "pages-media", 20, { needsPlan: true });
  if ("response" in c) return c.response;
  const { id } = await ctx.params;
  const page = await ownedPage(id, c.userId);
  if (!page) return jerr(404, "This page could not be found.");
  if (Number(req.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 50_000) return jerr(413, "That file is too large. The limit is 5 MB.", { field: "file" });
  let form: FormData;
  try { form = await req.formData(); } catch { return jerr(400, "Invalid request."); }
  const file = form.get("file");
  const kind = form.get("kind");
  if (kind !== "portrait" && kind !== "logo") return jerr(400, "Bad request");
  if (!(file instanceof File)) return jerr(422, "Choose an image file.", { field: "file" });
  if (file.size < 1 || file.size > MAX_UPLOAD_BYTES) return jerr(413, "That file is too large. The limit is 5 MB.", { field: "file" });
  let crop;
  try { crop = parseCrop(JSON.parse(String(form.get("crop") ?? "{}"))); } catch { crop = parseCrop({}); }
  let out;
  try { out = await processImage(Buffer.from(await file.arrayBuffer()), kind, crop); }
  catch (e) { return jerr(422, e instanceof MediaError ? e.message : "That file could not be read as a valid image.", { field: "file" }); }

  const db = adm();
  const mid = randomUUID();
  const base = `${c.userId}/${page.id}/${mid}`;
  const path = `${base}.webp`, vcfPath = out.vcf ? `${base}.vcf.jpg` : null;
  const up = await db.storage.from(PAGE_BUCKET).upload(path, out.main, { contentType: out.mime, upsert: false });
  if (up.error) return jerr(502, "The image could not be stored. Nothing was saved. Try again.");
  if (vcfPath && out.vcf) {
    const up2 = await db.storage.from(PAGE_BUCKET).upload(vcfPath, out.vcf, { contentType: "image/jpeg", upsert: false });
    if (up2.error) { await db.storage.from(PAGE_BUCKET).remove([path]); return jerr(502, "The image could not be stored. Nothing was saved. Try again."); }
  }
  const { error } = await db.from("page_media").insert({ id: mid, page_id: page.id, user_id: c.userId, kind, path, vcf_path: vcfPath, mime: out.mime, bytes: out.main.length, vcf_bytes: out.vcf?.length ?? 0, width: out.width, height: out.height });
  if (error) {
    await db.storage.from(PAGE_BUCKET).remove([path, ...(vcfPath ? [vcfPath] : [])]);
    if (error.code === "QF011") return jerr(403, "You have used all of your image storage. Remove a card photo you no longer need or choose a plan with more space.", { code: "limit" });
    if (error.code === "QF012") return jerr(403, "This page has too many unused images. Save your changes and try again.", { code: "limit" });
    return jerr(500, "The image could not be recorded. Nothing was saved. Try again.");
  }
  return Response.json({ id: mid, kind }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
