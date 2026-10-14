import { adm } from "@/lib/admin/db";
import { emptyCard, normaliseCard } from "@/lib/pages/card";
import { customer, isMissingTable, jerr, newPublicId } from "@/lib/pages/server";
import { PLANS } from "@/lib/plans";
import { readJson } from "@/lib/request-guards";

/** Create a draft card. The quota is enforced by the database trigger (QF010); the checks here only give a clear message. */
export async function POST(req: Request) {
  const c = await customer(req, "pages-create", 20, { needsPlan: true });
  if ("response" in c) return c.response;
  const parsed = await readJson(req, 60_000);
  if (!parsed || "tooLarge" in parsed) return jerr(400, "Bad request");
  const b = parsed.body as Record<string, unknown>;
  const title = typeof b?.title === "string" ? b.title.trim().slice(0, 80) : "";
  if (!title) return jerr(422, "Give the card a name so you can find it later.", { field: "title" });
  const draft = b.card ? normaliseCard(b.card) : emptyCard();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await adm().from("pages").insert({ user_id: c.userId, kind: "card", title, public_id: newPublicId(), draft }).select("id").single();
    if (!error) return Response.json({ id: data.id }, { status: 201 });
    if (error.code === "23505") continue; // public id collision: draw another
    if (error.code === "QF010") return jerr(403, `Your ${PLANS[c.plan].name} plan includes ${PLANS[c.plan].maxPages} hosted pages. Delete one or choose a plan with more space.`, { code: "limit" });
    if (isMissingTable(error)) return jerr(503, "Hosted pages are not available yet.", { code: "unconfigured" });
    return jerr(500, "We couldn’t create the card. Try again.");
  }
  return jerr(500, "We couldn’t create the card. Try again.");
}
