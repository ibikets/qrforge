/** CSV out. Cells that a spreadsheet could read as a formula are prefixed with an apostrophe so they stay text. */
export const safeCell = (v: string): string => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
export function toCsv(rows: string[][], safe = true): string {
  return "﻿" + rows.map((r) => r.map((v) => { const t = safe ? safeCell(v) : v; return /[",\r\n;\t]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; }).join(",")).join("\r\n") + "\r\n";
}
