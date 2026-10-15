import { adm } from "@/lib/admin/db";
import { isImportKind, itemsBlock, readUpload } from "@/lib/import/server";
import { fieldsFor, interpretRows, planImport, type Field, type Mapping, type Options } from "@/lib/import/table";
import { engineFor } from "@/lib/pages/kinds";
import type { PageContent } from "@/lib/pages/blocks";
import { customer, isMissingTable, jerr, noStore, ownedPage } from "@/lib/pages/server";
import { PLANS } from "@/lib/plans";

const KEY = /^[A-Za-z0-9_-]{8,64}$/;
type Counts = { rows: number; valid: number; invalid: number; skipped: number; added: number; updated: number; unchanged: number; warnings: number; noRoom: number; imagesNotFetched: number };

/**
 * Step 3: run the import into the DRAFT only. The server re-reads the file and recomputes everything; nothing the browser previewed is trusted.
 * Safe to retry: the same key never applies twice. A changed draft since the page was opened is refused (no silent overwrite). Publishing stays separate.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await customer(req, "import-apply", 30, { needsPlan: true });
  if ("response" in c) return c.response;
  const { id } = await ctx.params;
  const page = await ownedPage(id, c.userId);
  if (!page) return jerr(404, "This page could not be found.");
  if (page.lifecycle === "archived") return jerr(409, "Archived pages are read-only.", { code: "archived" });
  if (!isImportKind(page.kind)) return jerr(422, "Import is available for menus and catalogues.", { code: "kind" });
  let form: FormData; try { form = await req.formData(); } catch { return jerr(400, "Invalid request."); }
  let spec: { sheet?: unknown; headerRow?: unknown; mapping?: unknown; options?: unknown; edits?: unknown; key?: unknown; expectedVersion?: unknown };
  try { const raw = form.get("spec"); if (typeof raw !== "string" || raw.length > 4000) throw 0; spec = JSON.parse(raw); } catch { return jerr(400, "Bad request"); }
  const key = String(spec.key ?? ""), expected = Number(spec.expectedVersion), sheet = Number(spec.sheet), headerRow = Number(spec.headerRow);
  if (!KEY.test(key) || !Number.isInteger(expected) || !Number.isInteger(sheet) || sheet < 0 || !Number.isInteger(headerRow) || headerRow < 0) return jerr(400, "Bad request");
  const valid = new Set<string>(fieldsFor(page.kind));
  const mapping: Mapping = {};
  for (const [f, v] of Object.entries((spec.mapping ?? {}) as Record<string, unknown>)) { if (valid.has(f) && Number.isInteger(v) && (v as number) >= 0 && (v as number) < 40) mapping[f as Field] = v as number; }
  if (mapping.name === undefined && mapping.id === undefined && mapping.ref === undefined) return jerr(422, "Choose which column holds the name.", { code: "mapping" });
  const o = (spec.options ?? {}) as Partial<Options>;
  const options: Options = { mode: o.mode === "add" || o.mode === "update" ? o.mode : "both", duplicates: o.duplicates === "add" ? "add" : "skip", fields: (Array.isArray(o.fields) ? o.fields : []).filter((f): f is Field => typeof f === "string" && valid.has(f) && f !== "id" && f !== "imageUrl") };

  const db = adm();
  const prior = await db.from("import_jobs").select("id,counts,after_version,status").eq("user_id", c.userId).eq("idem_key", key).maybeSingle();
  if (prior.error && isMissingTable(prior.error)) return jerr(503, "Import isn’t switched on for this site yet.", { code: "unconfigured" });
  const pj = prior.data as { id: string; counts: Counts; after_version: number | null; status: string } | null;
  if (pj && pj.after_version !== null) return Response.json({ ok: true, replayed: true, counts: pj.counts, jobId: pj.id, version: pj.after_version, status: pj.status }, { headers: noStore });

  const up = await readUpload(form.get("file")); if (up instanceof Response) return up;
  const base = up.sheets.filter((s) => s.rows.length > 0)[sheet]?.rows; if (!base) return jerr(422, "That sheet could not be found in the file.");
  const rows = base.map((r) => [...r]);
  for (const e of Array.isArray(spec.edits) ? spec.edits.slice(0, 1000) : []) { // row-level corrections typed in the review step
    if (!Array.isArray(e) || e.length !== 3) continue; const [r, col, v] = e as [unknown, unknown, unknown];
    if (Number.isInteger(r) && Number.isInteger(col) && typeof v === "string" && v.length <= 5000 && (r as number) > headerRow && (r as number) < rows.length && (col as number) >= 0 && (col as number) < 40) { const row = rows[r as number]; while (row.length <= (col as number)) row.push(""); row[col as number] = v; }
  }
  const eng = engineFor(page.kind)!; const content = eng.normalise(page.draft) as PageContent; const blk = itemsBlock(content);
  if (!blk) return jerr(422, "This page has no items section to import into.");
  if (page.draft_version !== expected) return jerr(409, "This page was changed somewhere else since you opened the import. Reload it and run the import again.", { code: "conflict" });
  const limit = PLANS[c.plan].maxImportRows;
  const plan = planImport({ currency: blk.currency, categories: blk.categories }, interpretRows(rows, headerRow, mapping, page.kind, blk.currency), page.kind, options, limit);
  const counts: Counts = { ...plan.counts, imagesNotFetched: plan.imagesPending };
  if (plan.counts.added + plan.counts.updated === 0) return Response.json({ ok: true, noChanges: true, counts }, { headers: noStore });

  const next = { ...content, blocks: content.blocks.map((b) => (b === blk ? { ...blk, categories: plan.next } : b)) } as PageContent;
  const errors = eng.validate(next, false);
  if (Object.keys(errors).length) return jerr(422, "The result would not be valid, so nothing was changed.", { errors });

  let jobId = pj?.id ?? null;
  if (!jobId) {
    const ins = await db.from("import_jobs").insert({ user_id: c.userId, page_id: page.id, idem_key: key, source_name: up.name, mode: options.mode, counts, before_draft: page.draft, before_version: page.draft_version }).select("id").maybeSingle();
    if (ins.error?.code === "23505") return jerr(409, "This import is already running. Wait a moment, then check the page.", { code: "busy" });
    if (ins.error || !ins.data) return jerr(500, "We couldn’t start the import. Nothing was changed. Try again.");
    jobId = (ins.data as { id: string }).id;
  }
  const upd = await db.from("pages").update({ draft: next, draft_version: expected + 1, updated_at: new Date().toISOString() })
    .eq("id", page.id).eq("user_id", c.userId).eq("draft_version", expected).neq("lifecycle", "deleted").select("draft_version").maybeSingle();
  if (upd.error || !upd.data) {
    if (!pj) await db.from("import_jobs").delete().eq("id", jobId).is("after_version", null);
    return upd.error ? jerr(500, "We couldn’t save the import. Nothing was changed. Try again.") : jerr(409, "This page was changed somewhere else since you opened the import. Reload it and run the import again.", { code: "conflict" });
  }
  await db.from("import_jobs").update({ after_version: expected + 1 }).eq("id", jobId);
  return Response.json({ ok: true, counts, jobId, version: expected + 1 }, { headers: noStore });
}
