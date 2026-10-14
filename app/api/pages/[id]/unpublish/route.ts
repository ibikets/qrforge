import { adm } from "@/lib/admin/db";
import { customer, jerr, ownedPage, refreshPage } from "@/lib/pages/server";

/** Take the page offline. The record, drafts and revisions stay; the address shows a neutral unavailable page. Always allowed. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await customer(req, "pages-unpublish", 30);
  if ("response" in c) return c.response;
  const { id } = await ctx.params;
  const page = await ownedPage(id, c.userId);
  if (!page) return jerr(404, "This page could not be found.");
  const { error } = await adm().from("pages").update({ lifecycle: "unpublished", updated_at: new Date().toISOString() }).eq("id", page.id).eq("user_id", c.userId).eq("lifecycle", "published");
  if (error) return jerr(500, "We couldn’t unpublish. Try again.");
  refreshPage(page.public_id);
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
