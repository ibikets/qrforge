import { adm } from "@/lib/admin/db";
import { PAGE_BUCKET, UUID, attachment, customer, jerr } from "@/lib/pages/server";

/** Owner-only download of a draft PDF (to check what visitors will get). Same download-only headers as the public route. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string; mediaId: string }> }) {
  const c = await customer(req, "pages-file-read", 120);
  if ("response" in c) return c.response;
  const { id, mediaId } = await ctx.params;
  if (!UUID.test(id) || !UUID.test(mediaId)) return jerr(404, "Not found");
  const { data } = await adm().from("page_media").select("kind,path,mime,original_name").eq("id", mediaId).eq("page_id", id).eq("user_id", c.userId).maybeSingle();
  if (!data || data.kind !== "file" || data.mime !== "application/pdf") return jerr(404, "Not found");
  const f = await adm().storage.from(PAGE_BUCKET).download(data.path);
  if (f.error || !f.data) return jerr(404, "Not found");
  return new Response(await f.data.arrayBuffer(), { headers: {
    "Content-Type": "application/pdf", "Content-Disposition": attachment(data.original_name ?? "document.pdf"),
    "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Cache-Control": "private, no-store",
  } });
}
