import { adm } from "@/lib/admin/db";
import { customer, jerr, noStore, ownedPage, UUID } from "@/lib/pages/server";
import { readJson } from "@/lib/request-guards";

/** Put the draft back exactly as it was before one import, but only if nobody has edited it since (otherwise the edits would be lost). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await customer(req, "import-undo", 10, { needsPlan: true });
  if ("response" in c) return c.response;
  const { id } = await ctx.params;
  const page = await ownedPage(id, c.userId); if (!page) return jerr(404, "This page could not be found.");
  const p = await readJson(req, 2000); if (!p || "tooLarge" in p) return jerr(400, "Bad request");
  const jobId = String((p.body as { jobId?: unknown })?.jobId ?? ""); if (!UUID.test(jobId)) return jerr(400, "Bad request");
  const db = adm();
  const { data: job } = await db.from("import_jobs").select("id,before_draft,after_version,status").eq("id", jobId).eq("page_id", page.id).eq("user_id", c.userId).maybeSingle();
  const j = job as { before_draft: unknown; after_version: number | null; status: string } | null;
  if (!j || j.after_version === null) return jerr(404, "That import could not be found.");
  if (j.status === "undone") return jerr(409, "That import was already undone.", { code: "undone" });
  if (page.draft_version !== j.after_version) return jerr(409, "The page has been edited since this import, so it can’t be undone without losing those edits. Use Restore on a published version instead, or edit the items by hand.", { code: "edited" });
  const upd = await db.from("pages").update({ draft: j.before_draft, draft_version: page.draft_version + 1, updated_at: new Date().toISOString() })
    .eq("id", page.id).eq("user_id", c.userId).eq("draft_version", page.draft_version).select("draft_version").maybeSingle();
  if (upd.error || !upd.data) return jerr(409, "The page changed while undoing. Reload and try again.", { code: "conflict" });
  await db.from("import_jobs").update({ status: "undone", undone_at: new Date().toISOString() }).eq("id", jobId);
  return Response.json({ ok: true, version: page.draft_version + 1 }, { headers: noStore });
}
