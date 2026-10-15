import { LIMITS } from "@/lib/import/csv";
import { ImportError, readZip, writeZip } from "@/lib/import/zip";

export type Sheet = { name: string; rows: string[][] };
export type XlsxResult = { sheets: Sheet[]; notes: string[] };
const MAX_XML = 8 * 1024 * 1024;

const decode = (s: string) => s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e: string) => {
  if (e === "amp") return "&"; if (e === "lt") return "<"; if (e === "gt") return ">"; if (e === "quot") return '"'; if (e === "apos") return "'";
  const cp = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
  return cp > 31 && cp < 0x110000 && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : cp === 9 || cp === 10 || cp === 13 ? String.fromCodePoint(cp) : "";
}).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
const attrs = (tag: string): Record<string, string> => { const o: Record<string, string> = {}; for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"|([\w:.-]+)\s*=\s*'([^']*)'/g)) o[m[1] ?? m[3]] = decode(m[2] ?? m[4] ?? ""); return o; };
const text = (xml: string) => { let out = ""; for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t\s*\/>/g)) out += decode(m[1] ?? ""); return out; };
const colIndex = (ref: string) => { const m = /^([A-Z]{1,3})(\d+)$/.exec(ref); if (!m) return null; let c = 0; for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64; return { col: c - 1, row: +m[2] - 1 }; };
const num = (v: string) => { const n = Number(v); if (!Number.isFinite(n)) return v; return Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(15))); };

/**
 * Reads cell VALUES from an .xlsx. Formulas are never evaluated (the stored result is used, or nothing), macros and external links
 * are never opened, DOCTYPE/entity declarations are refused, and sizes are capped while inflating.
 */
export function readXlsx(buf: Buffer): XlsxResult {
  const { names, files } = readZip(buf, {
    maxEntries: 300, maxEntryBytes: MAX_XML, maxTotalBytes: 24 * 1024 * 1024,
    want: (n) => n === "[Content_Types].xml" || n === "xl/workbook.xml" || n === "xl/_rels/workbook.xml.rels" || n === "xl/sharedStrings.xml" || /^xl\/worksheets\/[^/]+\.xml$/.test(n),
  });
  if (!files.has("xl/workbook.xml")) throw new ImportError("This is not an Excel (.xlsx) workbook.");
  const notes: string[] = [];
  if (names.some((n) => /vbaProject\.bin$/i.test(n)) || /macroEnabled/i.test(files.get("[Content_Types].xml")?.toString("utf8") ?? "")) throw new ImportError("Macro-enabled workbooks (.xlsm) are not accepted. Save a copy as .xlsx or .csv and try again.");
  if (names.some((n) => /^xl\/externalLinks\//i.test(n))) notes.push("This workbook links to other files. Those links were ignored; only the values stored in this file were read.");
  const xml = (n: string) => { const s = files.get(n)?.toString("utf8") ?? ""; if (/<!DOCTYPE|<!ENTITY/i.test(s)) throw new ImportError("This workbook contains unsafe XML declarations and was refused."); return s; };

  const shared: string[] = [];
  const ss = xml("xl/sharedStrings.xml");
  if (ss) for (const m of ss.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si\s*\/>/g)) { shared.push(text((m[1] ?? "").replace(/<rPh[\s\S]*?<\/rPh>/g, ""))); if (shared.length > 200_000) throw new ImportError("This workbook has too many distinct text values."); }

  const rels: Record<string, string> = {};
  for (const m of xml("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)) { const a = attrs(m[0]); if (a.Id && a.Target) rels[a.Id] = a.Target; }
  const sheets: Sheet[] = []; let formulas = 0, errors = 0, hidden = 0, cells = 0;
  for (const m of xml("xl/workbook.xml").matchAll(/<sheet\b[^>]*>/g)) {
    const a = attrs(m[0]); const rid = a["r:id"] ?? a["id"]; if (!a.name) continue;
    if (a.state === "hidden" || a.state === "veryHidden") { hidden++; continue; }
    let target = rels[rid ?? ""]; if (!target) continue;
    target = target.startsWith("/") ? target.slice(1) : target.startsWith("xl/") ? target : `xl/${target}`;
    if (!/^xl\/worksheets\/[^/]+\.xml$/.test(target)) continue; // chart sheets, macro sheets and anything else
    const sx = xml(target); const rows: string[][] = [];
    for (const c of sx.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const a2 = attrs(c[1]); const pos = a2.r ? colIndex(a2.r) : null; if (!pos) continue;
      if (pos.row >= LIMITS.rows + 1 || pos.col >= LIMITS.cols) { if (pos.col >= LIMITS.cols && /<v|<is/.test(c[2] ?? "")) throw new ImportError(`This sheet has more than ${LIMITS.cols} columns.`); if (pos.row >= LIMITS.rows + 1) throw new ImportError(`This sheet has more than ${LIMITS.rows} rows.`); continue; }
      if (++cells > 300_000) throw new ImportError("This sheet has too many cells.");
      const body = c[2] ?? ""; if (/<f[\s>/]/.test(body)) formulas++;
      let v = "";
      if (a2.t === "inlineStr") v = text(body);
      else { const vm = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(body); const raw = vm ? decode(vm[1]) : "";
        if (a2.t === "s") v = shared[+raw] ?? ""; else if (a2.t === "str") v = raw; else if (a2.t === "b") v = raw === "1" ? "TRUE" : "FALSE"; else if (a2.t === "e") { errors++; v = ""; } else v = raw === "" ? "" : num(raw); }
      if (v.length > LIMITS.cellChars) throw new ImportError(`A cell is longer than ${LIMITS.cellChars} characters.`);
      if (v === "") continue;
      (rows[pos.row] ??= [])[pos.col] = v;
    }
    const dense = Array.from(rows, (r) => Array.from(r ?? [], (x) => x ?? ""));
    for (let i = 0; i < dense.length; i++) dense[i] ??= [];
    while (dense.length && dense[dense.length - 1].every((x) => x === "")) dense.pop();
    sheets.push({ name: a.name, rows: dense.filter((r, i) => r.some((x) => x !== "") || i < dense.length) });
  }
  if (!sheets.length) throw new ImportError(hidden ? "The only sheets in this workbook are hidden." : "This workbook has no sheets to read.");
  if (formulas) notes.push(`${formulas} cell${formulas === 1 ? " holds" : "s hold"} a formula. Formulas are never run: the value last saved in the file was used.`);
  if (errors) notes.push(`${errors} cell${errors === 1 ? " shows" : "s show"} a spreadsheet error and ${errors === 1 ? "was" : "were"} read as empty.`);
  if (hidden) notes.push(`${hidden} hidden sheet${hidden === 1 ? " was" : "s were"} skipped.`);
  return { sheets, notes };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
const colName = (i: number) => { let s = ""; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

/** A small, valid .xlsx. Every value is written as literal text (never a formula), the first row is bold. */
export function writeXlsx(sheets: Sheet[]): Buffer {
  const E = (name: string, s: string) => ({ name, data: Buffer.from(s, "utf8") });
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const parts = [
    E("[Content_Types].xml", head + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    E("_rels/.rels", head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    E("xl/workbook.xml", head + `<workbook ${ns} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name).slice(0, 31)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`),
    E("xl/_rels/workbook.xml.rels", head + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    E("xl/styles.xml", head + `<styleSheet ${ns}><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`),
    ...sheets.map((s, i) => E(`xl/worksheets/sheet${i + 1}.xml`, head + `<worksheet ${ns}><sheetData>${s.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => v === "" ? "" : `<c r="${colName(ci)}${ri + 1}" t="inlineStr" s="${ri === 0 ? 1 : 0}"><is><t xml:space="preserve">${esc(v)}</t></is></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`)),
  ];
  return writeZip(parts);
}
