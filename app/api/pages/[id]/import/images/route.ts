import { adm } from "@/lib/admin/db";
import { isImportKind, itemsBlock, testOrigins } from "@/lib/import/server";
import { FetchError, checkRobots, safeFetch } from "@/lib/net/safe-fetch";
import { engineFor } from "@/lib/pages/kinds";
import { MediaError } from "@/lib/pages/media";
import { storeGalleryImage } from "@/lib/pages/store-image";
import { withUploadSlot } from "@/lib/pages/upload-slots";
import type { PageContent } from "@/lib/pages/blocks";
import { collectMedia, customer, jerr, noStore, ownedPage } from "@/lib/pages/server";
import { readJson } from "@/lib/request-guards";

export const maxDuration = 60;
type Result = { itemId: string; status: "added" | "skipped" | "failed"; reason?: string };

/**
 * Optional pictures for items that are already in the draft. A small batch per request (the browser shows progress and can stop), each picture
 * fetched with the same network defences as website import, checked and re-encoded by the normal image pipeline, stored under the page's file
 * allowance, and attached only to an item that exists and has no picture yet. Safe to repeat: identical pictures are reused, nothing is overwritten.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await customer(req, "import-images", 30, { needsPlan: true });
  if ("response" in c) return c.response;
  const { id } = await ctx.params;
  const page = await ownedPage(id, c.userId);
  if (!page) return jerr(404, "This page could not be found.");
  if (page.lifecycle === "archived") return jerr(409, "Archived pages are read-only.", { code: "archived" });
  if (!isImportKind(page.kind)) return jerr(422, "Import is available for menus and catalogues.", { code: "kind" });
  const p = await readJson(req, 8000); if (!p || "tooLarge" in p) return jerr(400, "Bad request");
  const b = p.body as { confirm?: unknown; items?: unknown };
  if (b?.confirm !== true) return jerr(422, "Please confirm that you have the right to use these pictures.", { field: "confirm" });
  const list = (Array.isArray(b.items) ? b.items : []).slice(0, 3).filter((x): x is { itemId: string; url: string } => !!x && typeof x === "object" && typeof (x as { itemId?: unknown }).itemId === "string" && typeof (x as { url?: unknown }).url === "string" && (x as { url: string }).url.length <= 2000);
  if (!list.length) return jerr(400, "Bad request");
  const o = { testAllowOrigins: testOrigins() }; const results: Result[] = []; const attach = new Map<string, { id: string; w: number; h: number }>();
  const started = Date.now(); let stop: string | null = null;
  const robotsOk = new Map<string, string | null>();
  for (const it of list) {
    if (stop || Date.now() - started > 35_000) { results.push({ itemId: it.itemId, status: "failed", reason: stop ?? "Stopped to stay within the time allowed. Try again for the rest." }); continue; }
    try {
      const origin = it.url; new URL(origin); // robots rules differ per path, so the check is per picture
      if (!robotsOk.has(origin)) { try { await checkRobots(it.url, o); robotsOk.set(origin, null); } catch (e) { robotsOk.set(origin, e instanceof FetchError ? e.message : "Could not check robots.txt."); } }
      if (robotsOk.get(origin)) { results.push({ itemId: it.itemId, status: "failed", reason: robotsOk.get(origin)! }); continue; }
      const f = await safeFetch(it.url, { ...o, maxBytes: 5 * 1024 * 1024, accept: /^image\/(jpeg|png|webp)$/, deadlineMs: 8000 });
      const slot = await withUploadSlot(c.userId, () => storeGalleryImage(c.userId, page.id, f.body).catch((e) => e as Error));
      if (!slot.ok) { results.push({ itemId: it.itemId, status: "failed", reason: "Other pictures are still being checked. Try again." }); continue; }
      const st = slot.value;
      if (st instanceof Error) { results.push({ itemId: it.itemId, status: "failed", reason: st instanceof MediaError ? st.message : "That picture could not be read." }); continue; }
      if (!st.ok) { if (st.code === "quota" || st.code === "files") stop = st.code === "quota" ? "Your file storage is full. Remove files you no longer need or choose a plan with more space." : "This page has too many unused files. Save your changes and try again."; results.push({ itemId: it.itemId, status: "failed", reason: stop ?? "The picture could not be stored. Try again." }); continue; }
      attach.set(it.itemId, { id: st.id, w: st.width, h: st.height }); results.push({ itemId: it.itemId, status: "added" });
    } catch (e) { results.push({ itemId: it.itemId, status: "failed", reason: e instanceof FetchError ? e.message : "That picture could not be read." }); }
  }
  // attach to items in the CURRENT draft (re-read each attempt so edits made meanwhile are kept)
  const eng = engineFor(page.kind)!; let version = page.draft_version, content = eng.normalise(page.draft) as PageContent;
  for (let attempt = 0; attempt < 4 && attach.size; attempt++) {
    const blk = itemsBlock(content);
    if (blk) for (const cat of blk.categories) for (const item of cat.items) { const a = attach.get(item.id); if (a && !item.imageId) { item.imageId = a.id; item.meta = { w: a.w, h: a.h }; } }
    const upd = await adm().from("pages").update({ draft: content, draft_version: version + 1, updated_at: new Date().toISOString() }).eq("id", page.id).eq("user_id", c.userId).eq("draft_version", version).select("draft_version").maybeSingle();
    if (upd.data) { version = upd.data.draft_version as number; break; }
    const cur = await ownedPage(page.id, c.userId); if (!cur) return jerr(404, "This page could not be found.");
    version = cur.draft_version; content = eng.normalise(cur.draft) as PageContent;
    if (attempt === 3) for (const r of results) if (r.status === "added") { r.status = "failed"; r.reason = "The page changed while the picture was being added. Try again."; }
  }
  const blk2 = itemsBlock(content); const has = new Set((blk2?.categories ?? []).flatMap((cat) => cat.items.filter((i) => i.imageId && attach.get(i.id)?.id === i.imageId).map((i) => i.id)));
  for (const r of results) if (r.status === "added" && !has.has(r.itemId)) { r.status = "skipped"; r.reason = "That item no longer exists or already has a picture."; }
  await collectMedia(page.id, page.kind, eng.mediaRefs(content).map((r) => r.id)); // pictures that did not end up on an item are not kept
  return Response.json({ results, version }, { headers: noStore });
}
