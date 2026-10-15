import { createHash, randomUUID } from "node:crypto";
import { adm } from "@/lib/admin/db";
import { processGalleryImage } from "@/lib/pages/media";
import { PAGE_BUCKET } from "@/lib/pages/server";

export type Stored = { ok: true; id: string; width: number; height: number; reused: boolean } | { ok: false; code: "quota" | "files" | "storage" | "record" };
/** Store one already-validated gallery-style image for a page exactly as the upload route does (private bucket, WebP + thumbnail, quota triggers). Same bytes twice reuse the first copy. */
export async function storeGalleryImage(userId: string, pageId: string, input: Buffer): Promise<Stored> {
  const db = adm(); const sha = createHash("sha256").update(input).digest("hex");
  const dup = await db.from("page_media").select("id,width,height").eq("page_id", pageId).eq("kind", "image").eq("meta->>sha256", sha).limit(1).maybeSingle();
  if (dup.data) { const d = dup.data as { id: string; width: number; height: number }; return { ok: true, id: d.id, width: d.width, height: d.height, reused: true }; }
  const o = await processGalleryImage(input); // throws MediaError for anything that is not a real still PNG/JPEG/WebP
  const mid = randomUUID(); const base = `${userId}/${pageId}/${mid}`; const path = `${base}.webp`, tPath = `${base}.thumb.webp`;
  const up = await db.storage.from(PAGE_BUCKET).upload(path, o.main, { contentType: "image/webp", upsert: false }); if (up.error) return { ok: false, code: "storage" };
  const up2 = await db.storage.from(PAGE_BUCKET).upload(tPath, o.thumb, { contentType: "image/webp", upsert: false }); if (up2.error) { await db.storage.from(PAGE_BUCKET).remove([path]); return { ok: false, code: "storage" }; }
  const { error } = await db.from("page_media").insert({ id: mid, page_id: pageId, user_id: userId, kind: "image", path, vcf_path: tPath, mime: "image/webp", bytes: o.main.length, vcf_bytes: o.thumb.length, width: o.width || 1, height: o.height || 1, original_name: null, meta: { sha256: sha } });
  if (error) { await db.storage.from(PAGE_BUCKET).remove([path, tPath]); return { ok: false, code: error.code === "QF011" ? "quota" : error.code === "QF012" ? "files" : "record" }; }
  return { ok: true, id: mid, width: o.width, height: o.height, reused: false };
}
