import { adm } from "@/lib/admin/db";
import { PAGE_BUCKET, publicMedia } from "@/lib/pages/server";

/** Public image: only an image referenced by the page's PUBLISHED revision. Drafts and removed images answer 404. */
export async function GET(_req: Request, ctx: { params: Promise<{ publicId: string; mediaId: string }> }) {
  const { publicId, mediaId } = await ctx.params;
  const m = await publicMedia(publicId, mediaId).catch(() => null);
  if (!m) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const f = await adm().storage.from(PAGE_BUCKET).download(m.path);
  if (f.error || !f.data) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  // Short shared-cache life: after unpublish or takedown a cached copy disappears within minutes.
  return new Response(await f.data.arrayBuffer(), { headers: { "Content-Type": m.mime, "Cache-Control": "public, max-age=300, s-maxage=300", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" } });
}
