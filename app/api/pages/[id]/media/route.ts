import { createHash, randomUUID } from "node:crypto";
import { adm } from "@/lib/admin/db";
import { engineFor } from "@/lib/pages/kinds";
import { MAX_UPLOAD_BYTES, MediaError, parseCrop, processGalleryImage, processImage } from "@/lib/pages/media";
import { MAX_PDF_BYTES, PdfError, processPdf } from "@/lib/pages/pdf";
import { withUploadSlot } from "@/lib/pages/upload-slots";
import { PAGE_BUCKET, cleanName, customer, jerr, ownedPage } from "@/lib/pages/server";

/**
 * Upload a portrait, logo, gallery/cover image or PDF. The browser sends the original (plus a crop for portraits); everything else is
 * decided here: content inspection, re-encoding / rebuilding, limits, storage path. Stored in a private bucket; nothing is public until
 * a published version references it. Uploading the same bytes again for the same slot kind returns the existing file (safe retries).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await customer(req, "pages-media", 90, { needsPlan: true });
  if ("response" in c) return c.response;
  const { id } = await ctx.params;
  const page = await ownedPage(id, c.userId);
  if (!page) return jerr(404, "This page could not be found.");
  const eng = engineFor(page.kind);
  if (!eng) return jerr(422, "This kind of page is not available yet.", { code: "kind" });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_PDF_BYTES + 50_000) return jerr(413, "That file is too large. Images can be up to 5 MB and PDFs up to 10 MB.", { field: "file" });
  let form: FormData;
  try { form = await req.formData(); } catch { return jerr(400, "Invalid request."); }
  const file = form.get("file");
  const kind = form.get("kind");
  if (kind !== "portrait" && kind !== "logo" && kind !== "image" && kind !== "file") return jerr(400, "Bad request");
  if (!eng.uploads.includes(kind)) return jerr(422, "This type of page does not use that kind of file.", { field: "file" });
  if (!(file instanceof File)) return jerr(422, "Choose a file.", { field: "file" });
  const limit = kind === "file" ? MAX_PDF_BYTES : MAX_UPLOAD_BYTES;
  if (file.size < 1 || file.size > limit) return jerr(413, kind === "file" ? "That PDF is too large. The limit is 10 MB." : "That file is too large. The limit is 5 MB.", { field: "file" });
  const input = Buffer.from(await file.arrayBuffer());
  const sha = createHash("sha256").update(input).digest("hex");
  const db = adm();

  // Retry of an identical upload for this page and slot kind: hand back the existing file instead of storing a copy.
  const dup = await db.from("page_media").select("id,bytes,width,height,original_name,meta").eq("page_id", page.id).eq("kind", kind).eq("meta->>sha256", sha).limit(1).maybeSingle();
  if (dup.data && kind !== "portrait") {
    const d = dup.data as { id: string; bytes: number; width: number; height: number; original_name: string | null; meta: { pages?: number } | null };
    return Response.json({ id: d.id, kind, reused: true, ...(kind === "file" ? { name: d.original_name, bytes: d.bytes, pages: d.meta?.pages ?? null } : { width: d.width, height: d.height }) }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }

  type Done = { main: Buffer; mime: string; width: number; height: number; derivative: Buffer | null; derivativeExt: string; derivativeMime: string; pages: number | null };
  const slot = await withUploadSlot(c.userId, async (): Promise<Done> => {
    let width = 0, height = 0, derivative: Buffer | null = null, derivativeExt = "", derivativeMime = "", pages: number | null = null, main: Buffer, mime: string;
    if (kind === "file") { const p = await processPdf(input); main = p.main; mime = "application/pdf"; pages = p.pages; }
    else if (kind === "image") { const o = await processGalleryImage(input); main = o.main; mime = "image/webp"; width = o.width; height = o.height; derivative = o.thumb; derivativeExt = ".thumb.webp"; derivativeMime = "image/webp"; }
    else {
      let crop; try { crop = parseCrop(JSON.parse(String(form.get("crop") ?? "{}"))); } catch { crop = parseCrop({}); }
      const o = await processImage(input, kind, crop); main = o.main; mime = o.mime; width = o.width; height = o.height; derivative = o.vcf; derivativeExt = ".vcf.jpg"; derivativeMime = "image/jpeg";
    }
    return { main, mime, width, height, derivative, derivativeExt, derivativeMime, pages };
  }).catch((e) => e as Error);
  if (slot instanceof Error) return jerr(422, slot instanceof MediaError || slot instanceof PdfError ? slot.message : "That file could not be read.", { field: "file" });
  if (!slot.ok) return jerr(429, "Your other uploads are still being checked. Wait a moment and try again.", { code: "busy" });
  const { main, mime, width, height, derivative, derivativeExt, derivativeMime, pages } = slot.value;

  const mid = randomUUID();
  const base = `${c.userId}/${page.id}/${mid}`;
  const path = `${base}${kind === "file" ? ".pdf" : ".webp"}`, dPath = derivative ? `${base}${derivativeExt}` : null;
  const up = await db.storage.from(PAGE_BUCKET).upload(path, main, { contentType: mime, upsert: false });
  if (up.error) return jerr(502, "The file could not be stored. Nothing was saved. Try again.");
  if (dPath && derivative) {
    const up2 = await db.storage.from(PAGE_BUCKET).upload(dPath, derivative, { contentType: derivativeMime, upsert: false });
    if (up2.error) { await db.storage.from(PAGE_BUCKET).remove([path]); return jerr(502, "The file could not be stored. Nothing was saved. Try again."); }
  }
  const safeName = kind === "file" ? cleanName(file.name) : null;
  const { error } = await db.from("page_media").insert({
    id: mid, page_id: page.id, user_id: c.userId, kind, path, vcf_path: dPath, mime, bytes: main.length, vcf_bytes: derivative?.length ?? 0,
    width: width || 1, height: height || 1, original_name: safeName, meta: { sha256: sha, ...(pages ? { pages } : {}) },
  });
  if (error) {
    await db.storage.from(PAGE_BUCKET).remove([path, ...(dPath ? [dPath] : [])]); // failed upload leaves nothing behind
    if (error.code === "QF011") return jerr(403, "You have used all of your file storage. Remove files you no longer need or choose a plan with more space.", { code: "limit" });
    if (error.code === "QF012") return jerr(403, "This page has too many unused files. Save your changes and try again.", { code: "limit" });
    return jerr(500, "The file could not be recorded. Nothing was saved. Try again.");
  }
  return Response.json({ id: mid, kind, ...(kind === "file" ? { name: safeName, bytes: main.length, pages } : { width, height }) }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
