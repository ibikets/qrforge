import { adm } from "@/lib/admin/db";
import { PAGE_BUCKET, publicMedia } from "@/lib/pages/server";

/** Public image: only an image referenced by the page's PUBLISHED revision. Drafts, removed images and PDFs answer 404. */
export async function GET(req: Request, ctx: { params: Promise<{ publicId: string; mediaId: string }> }) {
  const { publicId, mediaId } = await ctx.params;
  const m = await publicMedia(publicId, mediaId).catch(() => null);
  if (!m || !m.mime.startsWith("image/")) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const thumb = new URL(req.url).searchParams.get("size") === "thumb" && m.kind === "image" && m.vcf_path;
  const f = await adm().storage.from(PAGE_BUCKET).download(thumb ? (m.vcf_path as string) : m.path);
  if (f.error || !f.data) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  // Short shared-cache life: after unpublish or takedown a cached copy disappears within a minute.
  return new Response(await f.data.arrayBuffer(), { headers: { "Content-Type": m.mime, "Cache-Control": "public, max-age=60, s-maxage=60", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" } });
}
