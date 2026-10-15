import { checkDestination } from "@/lib/links";
import { insertLink, jerr, linkCustomer, siteHost } from "@/lib/links-server";
import { PLANS } from "@/lib/plans";
import { readJson } from "@/lib/request-guards";

/** Create a dynamic link. The quota is enforced in the database (QF020); this only translates it. */
export async function POST(req: Request) {
  const c = await linkCustomer(req, "links-create", 20);
  if ("response" in c) return c.response;
  const parsed = await readJson(req, 20_000);
  if (!parsed || "tooLarge" in parsed || !parsed.body || typeof parsed.body !== "object") return jerr(400, "Bad request.");
  const b = parsed.body as Record<string, unknown>;
  const name = String(b.name ?? "").trim().slice(0, 80);
  if (!name) return jerr(400, "Give the link a name.", { field: "name" });
  const d = checkDestination(b.destination, siteHost(req));
  if (!d.ok) return jerr(400, d.error, { field: "destination" });
  const r = await insertLink(c.userId, name, d.url);
  if ("error" in r) {
    if (r.error?.code === "QF020") return jerr(403, `Your ${PLANS[c.plan].name} plan includes ${PLANS[c.plan].maxLinks} dynamic links. Delete one or choose a plan with more.`, { code: "limit" });
    if (r.error?.code === "42P01" || r.error?.code === "PGRST205") return jerr(503, "Dynamic links are not available yet.", { code: "unavailable" });
    return jerr(500, "We couldn’t create the link. Try again.");
  }
  return Response.json({ id: r.row.id }, { headers: { "Cache-Control": "no-store" } });
}
