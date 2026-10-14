import QRCode from "qrcode";
import { customer, jerr, ownedPage } from "@/lib/pages/server";
import { siteOrigin } from "@/lib/site";

/** QR code for the card's permanent address (not for a preview). Medium error correction; plain black on white for reliable scanning. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await customer(req, "pages-qr", 60);
  if ("response" in c) return c.response;
  const { id } = await ctx.params;
  const page = await ownedPage(id, c.userId);
  if (!page) return jerr(404, "This page could not be found.");
  const url = `${siteOrigin(req)}/p/${page.public_id}`;
  const fmt = new URL(req.url).searchParams.get("format") === "png" ? "png" : "svg";
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": `attachment; filename="card-qr.${fmt}"` };
  if (fmt === "png") {
    const buf = await QRCode.toBuffer(url, { errorCorrectionLevel: "M", width: 1024, margin: 4 });
    return new Response(new Uint8Array(buf), { headers: { ...headers, "Content-Type": "image/png" } });
  }
  return new Response(await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 4 }), { headers: { ...headers, "Content-Type": "image/svg+xml" } });
}
