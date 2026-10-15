import { adm } from "@/lib/admin/db";
import { checkDestination, normaliseRules } from "@/lib/links";
import { jerr, linkCustomer, ownedLink, siteHost } from "@/lib/links-server";
import { readJson } from "@/lib/request-guards";

/** Save a link. Optimistic version check: a second tab or device cannot silently overwrite a newer edit. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = await readJson(req, 60_000);
  if (!parsed || "tooLarge" in parsed || !parsed.body || typeof parsed.body !== "object") return jerr(400, "Bad request.");
  const b = parsed.body as Record<string, unknown>;
  const onlyState = Object.keys(b).every((k) => k === "state" || k === "version");
  const c = await linkCustomer(req, "links-save", 60, !onlyState);
  if ("response" in c) return c.response;
  const cur = await ownedLink(id, c.userId);
  if (!cur) return jerr(404, "This link could not be found.");
  if (cur.taken_down_at) return jerr(403, "This link was disabled by Qrenuvi and cannot be changed.", { code: "takedown" });
  if (b.version !== cur.version) return jerr(409, "This link was changed somewhere else. Reload to see the latest version.", { code: "conflict" });
  const patch: Record<string, unknown> = {};
  if (b.state !== undefined) { if (b.state !== "active" && b.state !== "paused") return jerr(400, "Bad state."); patch.state = b.state; }
  if (!onlyState) {
    const name = String(b.name ?? "").trim().slice(0, 80);
    if (!name) return jerr(400, "Give the link a name.", { field: "name" });
    const d = checkDestination(b.destination, siteHost(req));
    if (!d.ok) return jerr(400, d.error, { field: "destination" });
    const { rules, problems } = normaliseRules(b.rules, siteHost(req));
    const first = Object.keys(problems)[0];
    if (first) return jerr(422, problems[first], { field: first, problems });
    Object.assign(patch, { name, destination: d.url, rules });
  }
  const { data, error } = await adm().from("links").update({ ...patch, version: cur.version + 1, updated_at: new Date().toISOString() }).eq("id", cur.id).eq("version", cur.version).select("id,version").maybeSingle();
  if (error) return jerr(500, "We couldn’t save. Nothing was changed.");
  if (!data) return jerr(409, "This link was changed somewhere else. Reload to see the latest version.", { code: "conflict" });
  return Response.json({ version: data.version }, { headers: { "Cache-Control": "no-store" } });
}

/** Remove a link. Its address is never reused; anyone who scans a printed code sees "isn’t available". */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await linkCustomer(req, "links-delete", 30, false);
  if ("response" in c) return c.response;
  const { id } = await ctx.params;
  const cur = await ownedLink(id, c.userId);
  if (!cur) return jerr(404, "This link could not be found.");
  const { error } = await adm().from("links").update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", cur.id);
  if (error) return jerr(500, "We couldn’t delete it. Nothing was changed.");
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
