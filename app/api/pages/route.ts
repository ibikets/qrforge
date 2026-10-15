import { adm } from "@/lib/admin/db";
import { engineFor, isPageKind } from "@/lib/pages/kinds";
import { customer, isMissingTable, jerr, newPublicId } from "@/lib/pages/server";
import { PLANS } from "@/lib/plans";
import { readJson } from "@/lib/request-guards";

/** Create a draft page of a known kind. The quota is enforced by the database trigger (QF010); the checks here only give a clear message. */
export async function POST(req: Request) {
  const c = await customer(req, "pages-create", 20, { needsPlan: true });
  if ("response" in c) return c.response;
  const parsed = await readJson(req, 60_000);
  if (!parsed || "tooLarge" in parsed) return jerr(400, "Bad request");
  const b = parsed.body as Record<string, unknown>;
  const title = typeof b?.title === "string" ? b.title.trim().slice(0, 80) : "";
  if (!title) return jerr(422, "Give the page a name so you can find it later.", { field: "title" });
  const kind = b?.kind === undefined ? "card" : b.kind;
  if (!isPageKind(kind)) return jerr(422, "Choose what kind of page to create.", { field: "kind" });
  const eng = engineFor(kind)!;
  const draft = b.card ? eng.normalise(b.card) : eng.empty();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await adm().from("pages").insert({ user_id: c.userId, kind, title, public_id: newPublicId(), draft }).select("id").single();
    if (!error) return Response.json({ id: data.id }, { status: 201 });
    if (error.code === "23505") continue; // public id collision: draw another
    if (error.code === "QF010") return jerr(403, `Your ${PLANS[c.plan].name} plan includes ${PLANS[c.plan].maxPages} hosted pages. Delete one or choose a plan with more space.`, { code: "limit" });
    if (isMissingTable(error)) return jerr(503, "Hosted pages are not available yet.", { code: "unconfigured" });
    if (error.code === "23514" && kind !== "card") return jerr(503, "This page type is being set up and is not available yet. Your other pages are unaffected.", { code: "kind-unavailable" });
    return jerr(500, "We couldn’t create the page. Try again.");
  }
  return jerr(500, "We couldn’t create the page. Try again.");
}
