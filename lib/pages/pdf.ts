/**
 * PDF intake for hosted pages. This is NOT malware scanning. What it does, honestly:
 *  1. Judges the file by content: must start with a PDF header at byte 0 and end with an EOF marker (no HTML/ZIP/polyglot prefixes).
 *  2. Parses it with pdf-lib; encrypted, malformed or oversized documents are refused.
 *  3. Rebuilds a new PDF from the page content only. Document-level scripts, open actions, embedded files, forms, outlines,
 *     named destinations and every annotation (links, widgets, file attachments, their actions) are NOT copied; metadata is reset.
 *  4. The rebuilt file is the only thing stored. Delivery is download-only (attachment, nosniff, no-store; the site-wide CSP also applies), never inline.
 * What it cannot promise: that fonts, images or compressed streams inside the page content are free of parser exploits in the
 * recipient's PDF reader. That residual risk is why there is no inline preview and why the original upload is discarded.
 */
import { PDFDocument, PDFName } from "pdf-lib";

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_PAGES = 300;
export class PdfError extends Error {}

export async function processPdf(input: Buffer): Promise<{ main: Buffer; pages: number }> {
  if (input.length < 100) throw new PdfError("That file is not a valid PDF.");
  if (input.length > MAX_PDF_BYTES) throw new PdfError("That PDF is too large. The limit is 10 MB.");
  if (!/^%PDF-[12]\.\d/.test(input.subarray(0, 12).toString("latin1"))) throw new PdfError("That file is not a PDF. Choose a PDF exported from your document or slides.");
  if (!input.subarray(Math.max(0, input.length - 2048)).includes("%%EOF")) throw new PdfError("That PDF looks incomplete or damaged. Export it again and retry.");
  let src: PDFDocument;
  try { src = await PDFDocument.load(input, { ignoreEncryption: false, updateMetadata: false, throwOnInvalidObject: false }); }
  catch (e) {
    if (/encrypt/i.test(String((e as Error)?.message ?? e)) || (e as Error)?.constructor?.name === "EncryptedPDFError") throw new PdfError("Password-protected PDFs are not accepted. Remove the password and retry.");
    throw new PdfError("We couldn’t read that PDF. Export it again (for example “Save as PDF”) and retry.");
  }
  let n: number;
  try { n = src.getPageCount(); } catch { throw new PdfError("We couldn’t read that PDF. Export it again (for example “Save as PDF”) and retry."); }
  if (n < 1) throw new PdfError("That PDF has no pages.");
  if (n > MAX_PDF_PAGES) throw new PdfError(`That PDF has ${n} pages. The limit is ${MAX_PDF_PAGES}.`);
  try {
    // Strip risky page keys from the SOURCE pages first: copyPages registers everything reachable from a page, and anything
    // registered is written even if the new page no longer points at it (orphaned objects would still carry the script or link).
    for (const p of src.getPages()) for (const k of ["Annots", "AA", "Metadata", "PieceInfo", "B", "Thumb", "Trans"]) p.node.delete(PDFName.of(k));
    const out = await PDFDocument.create({ updateMetadata: false });
    const copied = await out.copyPages(src, Array.from({ length: n }, (_, i) => i));
    for (const p of copied) out.addPage(p);
    out.setProducer("Qrenuvi");
    out.setCreator("Qrenuvi");
    const bytes = Buffer.from(await out.save({ useObjectStreams: false }) /* plain objects: nothing hides inside compressed object streams, so the output can be audited */);
    if (bytes.length > MAX_PDF_BYTES) throw new PdfError("That PDF is too large after processing. The limit is 10 MB.");
    return { main: bytes, pages: n };
  } catch (e) {
    if (e instanceof PdfError) throw e;
    throw new PdfError("We couldn’t process that PDF. Export it again (for example “Save as PDF”) and retry.");
  }
}
