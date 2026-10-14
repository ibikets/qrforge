import { adm } from "@/lib/admin/db";
import { cardFromSnapshot, readSnapshot } from "@/lib/pages/card";
import { customer, jerr, ownedPage } from "@/lib/pages/server";
import { readJson } from "@/lib/request-guards";

/** Copy an old revision into the draft (it does not publish). Its images must still exist. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await customer(req, "pages-restore", 20, { needsPlan: true });
  if ("response" in c) return c.response;
  const { id } = await ctx.params;
  const page = await ownedPage(id, c.userId);
  if (!page) return jerr(404, "This page could not be found.");
  const parsed = await readJson(req, 2_000);
  const b = (parsed && "body" in parsed ? parsed.body : {}) as { version?: unknown; expectedVersion?: unknown };
  const version = Number(b.version), expected = Number(b.expectedVersion);
  if (!Number.isInteger(version) || !Number.isInteger(expected)) return jerr(400, "Bad request");
  const db = adm();
  const { data: rev } = await db.from("page_revisions").select("content").eq("page_id", page.id).eq("version", version).maybeSingle();
  const snap = readSnapshot(rev?.content);
  if (!snap) return jerr(404, "That version no longer exists.");
  const card = cardFromSnapshot(snap);
  const { data: media } = await db.from("page_media").select("id").eq("page_id", page.id);
  const have = new Set((media ?? []).map((m: { id: string }) => m.id));
  if (card.portraitId && !have.has(card.portraitId)) card.portraitId = null;
  if (card.logoId && !have.has(card.logoId)) card.logoId = null;
  const { data, error } = await db.from("pages").update({ draft: card, draft_version: expected + 1, updated_at: new Date().toISOString() })
    .eq("id", page.id).eq("user_id", c.userId).eq("draft_version", expected).select("draft_version").maybeSingle();
  if (error) return jerr(500, "We couldn’t restore that version. Try again.");
  if (!data) return jerr(409, "This page was changed somewhere else. Reload and try again.", { code: "conflict" });
  return Response.json({ version: data.draft_version, card }, { headers: { "Cache-Control": "no-store" } });
}
