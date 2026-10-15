// CSV and XLSX readers/writers: correct parsing, hostile inputs, budgets, formula safety. Local logic only.
import { deflateRawSync } from "node:zlib";
import { parseCsv, toCsv, safeCell } from "../lib/import/csv";
import { readXlsx, writeXlsx } from "../lib/import/xlsx";
import { ImportError, readZip, writeZip } from "../lib/import/zip";
let bad = 0; const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const throws = (f: () => unknown) => { try { f(); return null; } catch (e) { return e instanceof ImportError ? e.message : "OTHER:" + String(e); } };

// ---- CSV
ok(JSON.stringify(parseCsv("a,b\r\n1,2\r\n")) === '[["a","b"],["1","2"]]', "CSV: CRLF rows");
ok(JSON.stringify(parseCsv('﻿Name,Note\n"Jollof, party","say ""hi""\nbye"\n')) === '[["Name","Note"],["Jollof, party","say \\"hi\\"\\nbye"]]', "CSV: BOM, quoted commas, doubled quotes, newline inside quotes");
ok(JSON.stringify(parseCsv("a;b;c\n1;2;3")) === '[["a","b","c"],["1","2","3"]]' && JSON.stringify(parseCsv("a\tb\n1\t2")) === '[["a","b"],["1","2"]]', "CSV: semicolon and tab files");
ok(parseCsv("a,b\n\n,\n1,2").length === 2, "CSV: blank lines are dropped");
ok(throws(() => parseCsv('a,"b\n1,2')) !== null, "CSV: an unclosed quote is refused");
ok(throws(() => parseCsv("a\u0000b")) !== null, "CSV: binary content refused");
ok(throws(() => parseCsv(Array.from({ length: 5002 }, () => "x").join("\n"))) !== null, "CSV: row cap");
ok(throws(() => parseCsv(Array.from({ length: 41 }, (_, i) => "c" + i).join(","))) !== null, "CSV: column cap");
ok(throws(() => parseCsv("a\n" + "x".repeat(5001))) !== null, "CSV: cell length cap");
ok(safeCell("=SUM(A1)") === "'=SUM(A1)" && safeCell("+1") === "'+1" && safeCell("-2") === "'-2" && safeCell("@x") === "'@x" && safeCell("\tx") === "'\tx" && safeCell("Jollof") === "Jollof", "export: formula-looking cells are neutralised");
ok(toCsv([["Name", "Price"], ["=cmd|' /C calc'!A0", "1,500"]]).includes("'=cmd") && toCsv([["a"]]).startsWith("﻿"), "export: CSV carries the guard and a BOM");

// ---- ZIP / XLSX round trip
const rt = readXlsx(writeXlsx([{ name: "Menu", rows: [["Name", "Price"], ["Jollof & <rice>", "2,500"], ["=1+1", "x"]] }, { name: "Notes", rows: [["a"]] }]));
ok(rt.sheets.length === 2 && rt.sheets[0].name === "Menu" && rt.sheets[0].rows[1][0] === "Jollof & <rice>" && rt.sheets[0].rows[2][0] === "=1+1", "XLSX: our own writer's output reads back exactly (text stays text)");

// handcrafted workbook: shared strings, numbers, booleans, formula with cached value, formula without value, error, hidden sheet, external link part
const X = (name: string, s: string) => ({ name, data: Buffer.from(s) });
const wb = (sheets: string, extra: { name: string; data: Buffer }[] = [], ct = "") => writeZip([
  X("[Content_Types].xml", `<Types>${ct}</Types>`), X("xl/workbook.xml", `<workbook xmlns:r="r"><sheets>${sheets}</sheets></workbook>`),
  X("xl/_rels/workbook.xml.rels", '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>'),
  X("xl/sharedStrings.xml", '<sst><si><t>Name</t></si><si><t>Price</t></si><si><r><t>Fried </t></r><r><t>rice</t></r></si></sst>'), ...extra]);
const sheet1 = '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1"><v>1</v></c></row><row r="3"><c r="A3" t="s"><v>2</v></c><c r="B3"><v>2500.5000000000005</v></c><c r="C3" t="b"><v>1</v></c><c r="D3"><f>HYPERLINK("http://evil","x")</f><v>7</v></c><c r="E3"><f>A1+1</f></c><c r="F3" t="e"><v>#REF!</v></c></row></sheetData></worksheet>';
const w = readXlsx(wb('<sheet name="Menu" sheetId="1" r:id="rId1"/><sheet name="Secret" sheetId="2" state="hidden" r:id="rId2"/>', [X("xl/worksheets/sheet1.xml", sheet1), X("xl/worksheets/sheet2.xml", "<worksheet><sheetData/></worksheet>"), X("xl/externalLinks/externalLink1.xml", "<x/>")]));
const r0 = w.sheets[0].rows;
ok(w.sheets.length === 1 && w.sheets[0].name === "Menu", "XLSX: hidden sheets are skipped");
ok(r0[0][0] === "Name" && r0[0][1] === "Price" && r0[2][0] === "Fried rice" && r0[2][1] === "2500.5" && r0[2][2] === "TRUE", "XLSX: shared strings, rich text, floats cleaned, booleans");
ok(r0[2][3] === "7" && (r0[2][4] ?? "") === "" && (r0[2][5] ?? "") === "", "XLSX: a formula is never run (cached value only, none -> empty); errors read as empty");
ok(w.notes.some((n) => /formula/.test(n)) && w.notes.some((n) => /links to other files/.test(n)) && w.notes.some((n) => /hidden/.test(n)) && w.notes.some((n) => /error/.test(n)), "XLSX: the owner is told about formulas, external links, hidden sheets and errors");

// hostile inputs
ok(/Macro-enabled/.test(throws(() => readXlsx(wb('<sheet name="a" sheetId="1" r:id="rId1"/>', [X("xl/worksheets/sheet1.xml", "<worksheet/>"), X("xl/vbaProject.bin", "x")])))!), "XLSX: macro workbooks refused");
ok(/unsafe XML/.test(throws(() => readXlsx(wb('<sheet name="a" sheetId="1" r:id="rId1"/>', [X("xl/worksheets/sheet1.xml", '<!DOCTYPE lolz [<!ENTITY a "aaaa">]><worksheet>&a;</worksheet>')]))) ?? ""), "XLSX: DOCTYPE / entity declarations refused (no XML bombs, no XXE)");
ok(throws(() => readXlsx(Buffer.from("PK\u0003\u0004 not really a zip at all, just text of some length........"))) !== null, "XLSX: a non-zip is refused");
ok(throws(() => readXlsx(Buffer.from("name,price\nA,1\n"))) !== null, "XLSX: a CSV renamed .xlsx is refused");
ok(throws(() => readXlsx(writeZip([X("hello.txt", "hi")]))) !== null, "XLSX: a zip that is not a workbook is refused");
// zip bomb: central directory claims 1 KB but the stream inflates to 50 MB
{
  const big = deflateRawSync(Buffer.alloc(50 * 1024 * 1024, 97));
  const z = writeZip([X("[Content_Types].xml", "<Types/>"), X("xl/workbook.xml", "<workbook/>")]);
  // build a bomb entry by hand through writeZip then patching sizes
  const bomb = writeZip([{ name: "xl/workbook.xml", data: Buffer.alloc(1000, 97) }]);
  const cen = bomb.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); const loc = 0;
  bomb.writeUInt16LE(8, loc + 8); bomb.writeUInt32LE(big.length, loc + 18); bomb.writeUInt32LE(1000, loc + 22);
  bomb.writeUInt16LE(8, cen + 10); bomb.writeUInt32LE(big.length, cen + 20); bomb.writeUInt32LE(1000, cen + 24);
  const bytes = Buffer.concat([bomb.subarray(0, 30 + "xl/workbook.xml".length), big, bomb.subarray(30 + "xl/workbook.xml".length + 1000)]);
  const shift = big.length - 1000; const eo = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])); const cen2 = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  bytes.writeUInt32LE(bytes.readUInt32LE(eo + 16) + shift, eo + 16); bytes.writeUInt32LE(0, cen2 + 42);
  const t0 = Date.now(); const m = throws(() => readXlsx(bytes));
  ok(m !== null && Date.now() - t0 < 2000 && z.length > 0, `ZIP bomb: an entry that inflates past its declared size is refused quickly (${m})`);
}
ok(/too large|expands/.test(throws(() => readZip(writeZip([{ name: "a.xml", data: Buffer.alloc(100) }]), { maxEntries: 5, maxEntryBytes: 50, maxTotalBytes: 1000, want: () => true }))!), "ZIP: declared size over the cap refused before inflating");
ok(/too many parts/.test(throws(() => readZip(writeZip(Array.from({ length: 10 }, (_, i) => ({ name: `f${i}`, data: Buffer.alloc(1) }))), { maxEntries: 5, maxEntryBytes: 50, maxTotalBytes: 1000, want: () => true }))!), "ZIP: entry-count cap");
{ const enc = writeZip([{ name: "a.xml", data: Buffer.alloc(3) }]); const cen = enc.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); enc.writeUInt16LE(1, cen + 8); ok(/Password/.test(throws(() => readZip(enc, { maxEntries: 5, maxEntryBytes: 50, maxTotalBytes: 1000, want: () => true }))!), "ZIP: encrypted entries refused with a clear message"); }
const manyRows = '<worksheet><sheetData>' + Array.from({ length: 5003 }, (_, i) => `<row r="${i + 1}"><c r="A${i + 1}" t="inlineStr"><is><t>x</t></is></c></row>`).join("") + '</sheetData></worksheet>';
ok(/rows/.test(throws(() => readXlsx(wb('<sheet name="a" sheetId="1" r:id="rId1"/>', [X("xl/worksheets/sheet1.xml", manyRows)]))) ?? ""), "XLSX: row cap");
ok(/columns/.test(throws(() => readXlsx(wb('<sheet name="a" sheetId="1" r:id="rId1"/>', [X("xl/worksheets/sheet1.xml", '<worksheet><sheetData><row r="1"><c r="AZ1" t="inlineStr"><is><t>x</t></is></c></row></sheetData></worksheet>')]))) ?? ""), "XLSX: column cap");
process.exit(bad ? 1 : 0);
