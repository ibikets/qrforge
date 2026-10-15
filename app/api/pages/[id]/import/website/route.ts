import { FetchError, checkRobots, safeFetch } from "@/lib/net/safe-fetch";
import { candidatesTable, extractCandidates } from "@/lib/import/web";
import { isImportKind, testOrigins } from "@/lib/import/server";
import { withUploadSlot } from "@/lib/pages/upload-slots";
import { customer, jerr, noStore, ownedPage } from "@/lib/pages/server";
import { readJson } from "@/lib/request-guards";

/**
 * One public page, read once. The owner confirms they own the site or may reuse its content; we check robots.txt, fetch with strict network
 * defences (lib/net/safe-fetch.ts), read only published structured data, and hand the candidates back as an ordinary sheet for the same review
 * and draft-only import as a spreadsheet. Nothing is stored here and nothing is synchronised later.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await customer(req, "import-web", 20, { needsPlan: true });
  if ("response" in c) return c.response;
  const { id } = await ctx.params;
  const page = await ownedPage(id, c.userId);
  if (!page) return jerr(404, "This page could not be found.");
  if (!isImportKind(page.kind)) return jerr(422, "Import is available for menus and catalogues.", { code: "kind" });
  const p = await readJson(req, 4000); if (!p || "tooLarge" in p) return jerr(400, "Bad request");
  const b = p.body as { url?: unknown; confirm?: unknown };
  if (b?.confirm !== true) return jerr(422, "Please confirm that you own this website or have permission to reuse its content.", { field: "confirm" });
  const url = typeof b.url === "string" ? b.url.trim() : ""; if (!url || url.length > 2000) return jerr(422, "Enter the full web address of one page, starting with https://", { field: "url" });
  const slot = await withUploadSlot(c.userId, async () => {
    const o = { testAllowOrigins: testOrigins() };
    try {
      await checkRobots(url, o);
      const r = await safeFetch(url, { ...o, maxBytes: 1_500_000, accept: /^(text\/html|application\/xhtml\+xml)$/ });
      const ex = extractCandidates(r.body.toString("utf8"), r.url, page.kind as "menu" | "product");
      return Response.json({ sourceUrl: r.url, notes: ex.notes, count: ex.candidates.length, sheet: { name: "Website", rows: candidatesTable(ex.candidates, page.kind as "menu" | "product") } }, { headers: noStore });
    } catch (e) {
      if (e instanceof FetchError) return jerr(e.code === "blocked" || e.code === "robots" || e.code === "denied" || e.code === "type" || e.code === "size" ? 422 : 502, e.message, { code: e.code, field: "url" });
      return jerr(502, "That page could not be read.", { field: "url" });
    }
  });
  if (!slot.ok) return jerr(429, "Another import is still being read. Wait a moment and try again.", { code: "busy" });
  return slot.value;
}
