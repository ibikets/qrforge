/** CSV out. Cells that a spreadsheet could read as a formula are prefixed with an apostrophe so they stay text. */
export const safeCell = (v: string): string => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
export function toCsv(rows: string[][], safe = true): string {
  return "﻿" + rows.map((r) => r.map((v) => { const t = safe ? safeCell(v) : v; return /[",\r\n;\t]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; }).join(",")).join("\r\n") + "\r\n";
}

/** Plain CSV with NO formula guard. Only for handing rows from the browser back to our own importer; never for files a person opens in a spreadsheet. */
export function toCsvRaw(rows: string[][]): string {
  return rows.map((r) => r.map((c) => (/[",\r\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c)).join(",")).join("\r\n") + "\r\n";
}
