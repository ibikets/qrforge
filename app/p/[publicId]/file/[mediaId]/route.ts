import { adm } from "@/lib/admin/db";
import { PAGE_BUCKET, attachment, publicMedia } from "@/lib/pages/server";
import { rateLimit } from "@/lib/request-guards";

/**
 * Public document download. Only a PDF referenced by the page's PUBLISHED version is served; the answer is never cached, so unpublish,
 * takedown and replacement apply at once. Download-only by design: attachment disposition, nosniff, never rendered inline. (The site-wide proxy CSP applies and replaces any per-route CSP; the attachment disposition is the control that matters here.)
 */
export async function GET(req: Request, ctx: { params: Promise<{ publicId: string; mediaId: string }> }) {
  const limited = rateLimit(req, "pfile", 60);
  if (limited) return limited;
  const { publicId, mediaId } = await ctx.params;
  const m = await publicMedia(publicId, mediaId).catch(() => null);
  const gone = () => new Response("This file isn’t available.", { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!m || m.kind !== "file" || m.mime !== "application/pdf") return gone();
  const f = await adm().storage.from(PAGE_BUCKET).download(m.path);
  if (f.error || !f.data) return gone();
  return new Response(await f.data.arrayBuffer(), { headers: {
    "Content-Type": "application/pdf", "Content-Disposition": attachment(m.original_name ?? "document.pdf"),
    "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
  } });
}
