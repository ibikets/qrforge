import { ImportError } from "@/lib/import/errors";
export { safeCell, toCsv } from "@/lib/import/export";

export const LIMITS = { fileBytes: 2 * 1024 * 1024, rows: 5000, cols: 40, cellChars: 5000 };

/** RFC 4180 CSV with BOM removal and comma, semicolon or tab detection. Never evaluates anything; every cell is plain text. */
export function parseCsv(input: string): string[][] {
  const s = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  if (s.length > LIMITS.fileBytes) throw new ImportError("This file is too large to import.");
  if (s.includes("\u0000")) throw new ImportError("This does not look like a text CSV file.");
  const first = s.split(/\r\n|\n|\r/, 1)[0] ?? "";
  const count = (ch: string) => { let n = 0, q = false; for (const c of first) { if (c === '"') q = !q; else if (c === ch && !q) n++; } return n; };
  const delim = [",", ";", "\t"].map((d) => [d, count(d)] as const).sort((a, b) => b[1] - a[1])[0][1] > 0 ? [",", ";", "\t"].map((d) => [d, count(d)] as const).sort((a, b) => b[1] - a[1])[0][0] : ",";
  const rows: string[][] = []; let row: string[] = [], cell = "", q = false, i = 0;
  const endCell = () => { if (cell.length > LIMITS.cellChars) throw new ImportError(`A cell is longer than ${LIMITS.cellChars} characters.`); row.push(cell); cell = ""; if (row.length > LIMITS.cols) throw new ImportError(`This sheet has more than ${LIMITS.cols} columns.`); };
  const endRow = () => { endCell(); if (row.some((c) => c !== "")) rows.push(row); row = []; if (rows.length > LIMITS.rows) throw new ImportError(`This file has more than ${LIMITS.rows} rows.`); };
  while (i < s.length) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"' && cell === "") q = true;
    else if (c === delim) endCell();
    else if (c === "\r") { if (s[i + 1] === "\n") i++; endRow(); }
    else if (c === "\n") endRow();
    else cell += c;
    i++;
  }
  if (q) throw new ImportError("A quoted cell is never closed, so the file is damaged.");
  if (cell !== "" || row.length) endRow();
  return rows;
}

