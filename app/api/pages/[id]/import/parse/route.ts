import { isImportKind, readUpload } from "@/lib/import/server";
import { customer, jerr, noStore, ownedPage } from "@/lib/pages/server";

/** Step 1: read the file (no changes to the page) and return its sheets so the browser can map columns and preview. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await customer(req, "import-parse", 40, { needsPlan: true });
  if ("response" in c) return c.response;
  const { id } = await ctx.params;
  const page = await ownedPage(id, c.userId);
  if (!page) return jerr(404, "This page could not be found.");
  if (!isImportKind(page.kind)) return jerr(422, "Import is available for menus and catalogues.", { code: "kind" });
  let form: FormData; try { form = await req.formData(); } catch { return jerr(400, "Invalid request."); }
  const up = await readUpload(form.get("file")); if (up instanceof Response) return up;
  const sheets = up.sheets.filter((s) => s.rows.length > 0);
  if (!sheets.length) return jerr(422, "No rows were found in that file.", { field: "file" });
  return Response.json({ name: up.name, notes: up.notes, sheets }, { headers: noStore });
}
