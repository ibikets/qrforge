import { adm } from "@/lib/admin/db";
import { normaliseCard, validateCard } from "@/lib/pages/card";
import { PAGE_BUCKET, PAGE_COLS, UUID, collectMedia, customer, jerr, mediaBelongs, ownedPage, refreshPage, type PageRow } from "@/lib/pages/server";
import { readJson } from "@/lib/request-guards";

type SaveBody = { title?: unknown; card?: unknown; expectedVersion?: unknown };

/** Save the draft with optimistic concurrency: it only applies when expectedVersion is still the current version. */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await customer(req, "pages-save", 120, { needsPlan: true });
  if ("response" in c) return c.response;
  const { id } = await ctx.params;
  const page = await ownedPage(id, c.userId);
  if (!page) return jerr(404, "This page could not be found.");
  if (page.lifecycle === "archived") return jerr(409, "Archived pages are read-only.", { code: "archived" });
  const parsed = await readJson(req, 60_000);
  if (!parsed || "tooLarge" in parsed) return jerr(413, "That request is too large.");
  const b = parsed.body as SaveBody;
  const expected = Number(b?.expectedVersion);
  if (!Number.isInteger(expected)) return jerr(400, "Bad request");
  const title = typeof b.title === "string" ? b.title.trim().slice(0, 80) : page.title;
  if (!title) return jerr(422, "The card needs a name.", { field: "title" });
  const card = normaliseCard(b.card);
  const errors = validateCard(card, false);
  if (Object.keys(errors).length) return jerr(422, "Fix the highlighted fields.", { errors });
  if (!(await mediaBelongs(page.id, card))) return jerr(422, "That image does not belong to this page.", { code: "media" });

  const { data, error } = await adm().from("pages")
    .update({ title, draft: card, draft_version: expected + 1, updated_at: new Date().toISOString() })
    .eq("id", page.id).eq("user_id", c.userId).eq("draft_version", expected).neq("lifecycle", "deleted").select("draft_version").maybeSingle();
  if (error) return jerr(500, "We couldn’t save. Your changes are still on this screen. Try again.");
  if (!data) {
    const cur = await ownedPage(page.id, c.userId);
    if (!cur) return jerr(404, "This page could not be found.");
    return jerr(409, "This page was changed somewhere else. Your edits are kept here; reload to compare.", { code: "conflict", current: { version: cur.draft_version, title: cur.title, card: normaliseCard(cur.draft) } });
  }
  await collectMedia(page.id, [card.portraitId, card.logoId]);
  return Response.json({ version: data.draft_version }, { headers: { "Cache-Control": "no-store" } });
}

/** Delete = staged: the record is hidden and its public address stays reserved forever (no reuse). Images are removed. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await customer(req, "pages-delete", 20);
  if ("response" in c) return c.response;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return jerr(404, "This page could not be found.");
  const db = adm();
  const { data, error } = await db.from("pages").update({ lifecycle: "deleted", deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id).eq("user_id", c.userId).neq("lifecycle", "deleted").select(PAGE_COLS).maybeSingle();
  if (error || !data) return jerr(404, "This page could not be found.");
  refreshPage((data as PageRow).public_id);
  const { data: media } = await db.from("page_media").select("id,path,vcf_path").eq("page_id", id);
  if (media?.length) {
    await db.storage.from(PAGE_BUCKET).remove(media.flatMap((m: { path: string; vcf_path: string | null }) => [m.path, ...(m.vcf_path ? [m.vcf_path] : [])]));
    await db.from("page_media").delete().eq("page_id", id);
  }
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
