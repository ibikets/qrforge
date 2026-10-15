import QRCode from "qrcode";
import { jerr, linkCustomer, ownedLink } from "@/lib/links-server";
import { siteOrigin } from "@/lib/site";

/** QR code for the link's permanent address. It never changes when the destination does. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await linkCustomer(req, "links-qr", 60, false);
  if ("response" in c) return c.response;
  const { id } = await ctx.params;
  const link = await ownedLink(id, c.userId);
  if (!link) return jerr(404, "This link could not be found.");
  const url = `${siteOrigin(req)}/l/${link.slug}`;
  const fmt = new URL(req.url).searchParams.get("format") === "png" ? "png" : "svg";
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": `attachment; filename="link-qr.${fmt}"` };
  if (fmt === "png") return new Response(new Uint8Array(await QRCode.toBuffer(url, { errorCorrectionLevel: "M", width: 1024, margin: 4 })), { headers: { ...headers, "Content-Type": "image/png" } });
  return new Response(await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 4 }), { headers: { ...headers, "Content-Type": "image/svg+xml" } });
}
