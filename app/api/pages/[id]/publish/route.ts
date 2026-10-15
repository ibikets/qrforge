import { adm } from "@/lib/admin/db";
import { engineFor } from "@/lib/pages/kinds";
import { collectMedia, customer, jerr, ownedPage, refreshPage } from "@/lib/pages/server";
import { readJson } from "@/lib/request-guards";

/** Publish the saved draft. The database function swaps the live revision atomically; the public cache is refreshed after. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await customer(req, "pages-publish", 30, { needsPlan: true });
  if ("response" in c) return c.response;
  const { id } = await ctx.params;
  const page = await ownedPage(id, c.userId);
  if (!page) return jerr(404, "This page could not be found.");
  if (page.taken_down_at) return jerr(403, "This page has been disabled by Qrenuvi. Contact support.", { code: "takedown" });
  const parsed = await readJson(req, 2_000);
  const expected = parsed && "body" in parsed ? Number((parsed.body as { expectedVersion?: unknown })?.expectedVersion) : NaN;
  if (!Number.isInteger(expected)) return jerr(400, "Bad request");
  // Publish exactly what is saved, never what the browser says: validate the stored draft.
  const eng = engineFor(page.kind);
  if (!eng) return jerr(422, "This kind of page is not available yet.", { code: "kind" });
  const card = eng.normalise(page.draft);
  const errors = eng.validate(card, true);
  if (Object.keys(errors).length) return jerr(422, "Fix these before publishing.", { errors, code: "invalid" });
  const { data, error } = await adm().rpc("publish_page", { p_page: page.id, p_user: c.userId, p_expected: expected, p_content: eng.snapshot(card) });
  if (error) {
    const map: Record<string, [number, string, string]> = {
      QF023: [409, "The saved draft changed since you opened this screen. Reload to see the latest version.", "conflict"],
      QF024: [403, "Your plan does not include hosted pages.", "plan"],
      QF022: [403, "This page has been disabled by Qrenuvi. Contact support.", "takedown"],
      QF021: [409, "This page cannot be published in its current state.", "state"],
      QF020: [404, "This page could not be found.", "notfound"],
    };
    const m = map[error.code ?? ""];
    return m ? jerr(m[0], m[1], { code: m[2] }) : jerr(500, "We couldn’t publish. Nothing changed. Try again.");
  }
  refreshPage(page.public_id);
  await collectMedia(page.id, page.kind, eng.mediaRefs(card).map((r) => r.id));
  return Response.json({ version: data, publicId: page.public_id }, { headers: { "Cache-Control": "no-store" } });
}
