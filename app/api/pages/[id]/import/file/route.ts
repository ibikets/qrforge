import { engineFor } from "@/lib/pages/kinds";
import { fileResponse, isImportKind, itemsBlock } from "@/lib/import/server";
import { exportRows, templateRows } from "@/lib/import/table";
import { type PageContent } from "@/lib/pages/blocks";
import { jerr, ownedPage } from "@/lib/pages/server";
import { rateLimit } from "@/lib/request-guards";
import { getSession } from "@/lib/supabase";

/** Downloads: ?what=template|items&format=csv|xlsx. Items exports carry the stable Item ID so a later import can update the same items. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession(); if (!s.userId) return jerr(401, "Please sign in.");
  const limited = rateLimit(req, "import-file", 30, 60_000, s.userId); if (limited) return limited;
  const { id } = await ctx.params;
  const page = await ownedPage(id, s.userId); if (!page) return jerr(404, "This page could not be found.");
  if (!isImportKind(page.kind)) return jerr(422, "Import is available for menus and catalogues.", { code: "kind" });
  const u = new URL(req.url); const what = u.searchParams.get("what"); const format = u.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const eng = engineFor(page.kind)!; const content = eng.normalise(page.draft) as PageContent; const blk = itemsBlock(content);
  const currency = blk?.currency ?? "NGN";
  if (what === "template") return fileResponse(format, `${page.kind === "menu" ? "menu" : "catalogue"}-template`, "Items", templateRows(page.kind, currency));
  if (what === "items") return fileResponse(format, `${page.kind === "menu" ? "menu" : "catalogue"}-items`, "Items", exportRows(page.kind, currency, blk?.categories ?? []));
  return jerr(400, "Bad request");
}
