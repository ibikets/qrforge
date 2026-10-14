import { adm } from "@/lib/admin/db";
import { PAGE_BUCKET, UUID, customer, jerr } from "@/lib/pages/server";

/** Owner-only image preview (drafts). Private cache only; the public never reaches this route. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string; mediaId: string }> }) {
  const c = await customer(req, "pages-media-read", 300);
  if ("response" in c) return c.response;
  const { id, mediaId } = await ctx.params;
  if (!UUID.test(id) || !UUID.test(mediaId)) return jerr(404, "Not found");
  const { data } = await adm().from("page_media").select("path,mime").eq("id", mediaId).eq("page_id", id).eq("user_id", c.userId).maybeSingle();
  if (!data) return jerr(404, "Not found");
  const f = await adm().storage.from(PAGE_BUCKET).download(data.path);
  if (f.error || !f.data) return jerr(404, "Not found");
  return new Response(await f.data.arrayBuffer(), { headers: { "Content-Type": data.mime, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
}
