import { ImportError } from "@/lib/import/errors";
import { LIMITS, parseCsv } from "@/lib/import/csv";
import { readXlsx, writeXlsx, type Sheet } from "@/lib/import/xlsx";
import { toCsv } from "@/lib/import/export";
import { jerr } from "@/lib/pages/server";
import type { Block, PageContent } from "@/lib/pages/blocks";
import type { ImportKind } from "@/lib/import/table";

export const IMPORT_KINDS = ["menu", "product"] as const;
export const isImportKind = (k: string): k is ImportKind => k === "menu" || k === "product";
export type ItemsBlock = Extract<Block, { type: "items" }>;
export const itemsBlock = (c: PageContent): ItemsBlock | null => (c.blocks.find((b) => b.type === "items") as ItemsBlock | undefined) ?? null;

export type Upload = { name: string; sheets: Sheet[]; notes: string[] };
/** Reads a CSV or .xlsx from a multipart request. Format is decided by content (ZIP signature), not by the browser-supplied type. */
export async function readUpload(file: unknown): Promise<Upload | Response> {
  if (!(file instanceof File)) return jerr(422, "Choose a CSV or Excel (.xlsx) file.", { field: "file" });
  if (file.size < 1) return jerr(422, "That file is empty.", { field: "file" });
  if (file.size > LIMITS.fileBytes) return jerr(413, "That file is too large. The limit is 2 MB.", { field: "file" });
  const name = (file.name || "import").replace(/[\u0000-\u001f\u007f/\\]+/g, " ").slice(0, 120);
  const buf = Buffer.from(await file.arrayBuffer());
  try {
    if (buf[0] === 0x50 && buf[1] === 0x4b) {
      if (!/\.xlsx$/i.test(name)) return jerr(422, "Only .xlsx workbooks are accepted. Save older .xls files as .xlsx or CSV first.", { field: "file" });
      const r = readXlsx(buf); return { name, sheets: r.sheets, notes: r.notes };
    }
    if (/\.(xlsx|xlsm|xls)$/i.test(name)) return jerr(422, "That does not look like a valid .xlsx workbook. Save the sheet as .xlsx or CSV and try again.", { field: "file" });
    return { name, sheets: [{ name: "CSV", rows: parseCsv(buf.toString("utf8")) }], notes: [] };
  } catch (e) {
    if (e instanceof ImportError) return jerr(422, e.message, { field: "file" });
    return jerr(422, "That file could not be read.", { field: "file" });
  }
}
export const fileResponse = (format: "csv" | "xlsx", base: string, sheetName: string, rows: string[][]) => {
  const clean = base.replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 40) || "qrenuvi";
  const body = format === "xlsx" ? new Uint8Array(writeXlsx([{ name: sheetName, rows }])) : new TextEncoder().encode("﻿" + toCsv(rows));
  return new Response(body, { headers: { "Content-Type": format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${clean}.${format}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
};

/** Test-only allowance for a local fixture website. Never honoured on Vercel (VERCEL is always set there). */
export const testOrigins = () => (process.env.VERCEL ? [] : (process.env.IMPORT_FETCH_TEST_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean));
