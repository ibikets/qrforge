// PDF intake. Run: npx tsx tests/pages-pdf.ts   (Local: real pdf-lib parsing of generated, spoofed and hostile files.)
import { PDFDocument, PDFName, PDFString, StandardFonts } from "pdf-lib";
import { MAX_PDF_BYTES, MAX_PDF_PAGES, PdfError, processPdf } from "../lib/pages/pdf";

let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const refuses = async (b: Buffer, m: string, re?: RegExp) => { try { await processPdf(b); ok(false, m + " (accepted!)"); } catch (e) { ok(e instanceof PdfError && (!re || re.test((e as Error).message)), m + " -> " + (e as Error).message); } };
const make = async (pages = 3, tweak?: (d: PDFDocument) => void) => {
  const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) d.addPage([300, 300]).drawText(`Page ${i + 1} SECRET-BODY`, { x: 20, y: 150, font: f, size: 18 });
  d.setAuthor("Author Name"); d.setTitle("Private Title");
  tweak?.(d);
  return Buffer.from(await d.save({ useObjectStreams: false }));
};

async function main() {
const good = await make(3);
const r = await processPdf(good);
const re = await PDFDocument.load(r.main, { updateMetadata: false });
ok(r.pages === 3 && re.getPageCount() === 3 && r.main.subarray(0, 5).toString() === "%PDF-", "valid PDF is accepted and rebuilt (3 pages)");
ok(!r.main.includes("Private Title") && !r.main.includes("Author Name") && re.getProducer() === "Qrenuvi" && !re.getTitle() && !re.getAuthor(), "document metadata (title, author) is reset");

// active content is not carried over
const active = await make(2, (d) => {
  d.addJavaScript("evil", "app.alert('pwned')");
  const ctx = d.context;
  const act = ctx.obj({ S: "JavaScript", JS: PDFString.of("app.alert('page')") });
  const uri = ctx.obj({ S: "URI", URI: PDFString.of("https://evil.example/") });
  const annot = ctx.obj({ Type: "Annot", Subtype: "Link", Rect: [0, 0, 100, 100], A: uri, AA: ctx.obj({ E: act }) });
  d.getPage(0).node.set(PDFName.of("Annots"), ctx.obj([ctx.register(annot)]));
  d.getPage(0).node.set(PDFName.of("AA"), ctx.obj({ O: act }));
  d.catalog.set(PDFName.of("OpenAction"), act);
  d.attach(Buffer.from("MZ-fake-exe"), "invoice.exe", { mimeType: "application/x-msdownload" });
});
ok(active.includes("app.alert") && active.includes("evil.example") && active.includes("invoice.exe") || active.includes("EmbeddedFile"), "test input really contains scripts, a link and an attachment");
const clean = await processPdf(active);
const txt = clean.main.toString("latin1");
const cleanDoc = await PDFDocument.load(clean.main, { updateMetadata: false });
ok(!cleanDoc.catalog.has(PDFName.of("OpenAction")) && !cleanDoc.catalog.has(PDFName.of("Names")) && !cleanDoc.getPage(0).node.has(PDFName.of("Annots")), "rebuilt catalog and page have no OpenAction, Names or Annots");
{ const hit = txt.match(/JavaScript|\/JS\b|app\.alert|OpenAction|EmbeddedFile|invoice\.exe|evil\.example|\/URI|\/Annots|\/AA\b|AcroForm|\/Names/); ok(!hit, "output has no scripts, open actions, attachments, links or annotations" + (hit ? " (found " + hit[0] + ")" : "")); }
ok(clean.pages === 2 && (await PDFDocument.load(clean.main)).getPageCount() === 2, "page content survives (2 pages)");

// spoofing and malformed input
await refuses(Buffer.from("<html><script>alert(1)</script></html>".padEnd(200, " ")), "HTML renamed .pdf", /not a PDF/);
await refuses(Buffer.concat([Buffer.from("PK\u0003\u0004"), Buffer.alloc(300, 1)]), "ZIP renamed .pdf", /not a PDF/);
await refuses(Buffer.concat([Buffer.from("GARBAGE-PREFIX"), good]), "PDF with a prefix (polyglot/offset header)", /not a PDF/);
await refuses(Buffer.from("%PDF-1.4\n" + "x".repeat(500)), "header but no EOF marker (truncated)", /incomplete|damaged/);
await refuses(good.subarray(0, Math.floor(good.length / 2)), "truncated real PDF");
await refuses(Buffer.alloc(0), "empty file");
await refuses(Buffer.from("%PDF-1.4\n%%EOF"), "tiny stub");
await refuses(Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(300, 0x41), Buffer.from("\n%%EOF\n")]), "header+EOF around garbage");
await refuses(Buffer.alloc(MAX_PDF_BYTES + 1, 0x20), "over the size limit", /too large/);
const enc = await make(1, (d) => { d.context.trailerInfo.Encrypt = d.context.register(d.context.obj({ Filter: "Standard", V: 1, R: 2, O: PDFString.of("x".repeat(32)), U: PDFString.of("y".repeat(32)), P: -4 })); });
await refuses(enc, "encrypted PDF", /Password-protected/);
const many = await make(MAX_PDF_PAGES + 1);
await refuses(many, `more than ${MAX_PDF_PAGES} pages`, /pages/);
console.log(bad ? `\n${bad} FAILED` : "\nall passed");
process.exit(bad ? 1 : 0);
}
main();
