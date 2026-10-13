import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { PLANS } from "@/lib/plans";
import { QR_TYPES, buildPayload, type Fields, type QrType } from "@/lib/qr";
import { renderSvg, sanitizeStyle } from "@/lib/qr-render";
import { getSession } from "@/lib/supabase";


const err = (message: string, status: number) => Response.json({ error: message, upgrade: status === 403 }, { status });

/**
 * The ONLY way to obtain a downloadable file. Plan limits are enforced here, against the
 * plan stored in the database for the signed-in user (anonymous visitors get Free).
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return err("Bad request", 400);

  const { plan } = await getSession();
  const caps = PLANS[plan];

  const type = body.type as QrType;
  const def = QR_TYPES.find((t) => t.id === type);
  if (!def) return err("Unknown QR type", 400);
  if (!def.basic && caps.types === "basic") return err(`${def.label} codes need a Pro plan.`, 403);

  const format = String(body.format);
  if (format !== "png" && format !== "svg" && format !== "pdf") return err("Unknown format", 400);
  if (!caps.formats.includes(format)) return err(`${format.toUpperCase()} downloads need a Pro plan.`, 403);

  const size = Math.round(Number(body.size) || 512);
  if (size < 128) return err("Size too small", 400);
  if (size > caps.maxSize) return err(`Your ${caps.name} plan allows up to ${caps.maxSize}px.`, 403);

  const style = sanitizeStyle(body.style);
  const wantedLogo = typeof body.style?.logo === "string" && body.style.logo.length > 0;
  if (wantedLogo && !caps.logo) return err("Adding a logo needs a Pro plan.", 403);
  if (wantedLogo && !style.logo) return err("Logo must be a PNG, JPEG or WebP under ~100KB.", 400);

  const fields: Fields = body.fields && typeof body.fields === "object" ? body.fields : {};
  const payload = buildPayload(type, fields);
  if (!payload) return err("Fill in the details first.", 400);

  let svg: string;
  try {
    svg = renderSvg(payload, style, size);
  } catch {
    return err("That is too much data for one QR code.", 400);
  }

  const headers = (type: string, ext: string) => ({
    "Content-Type": type,
    "Content-Disposition": `attachment; filename="qrcode.${ext}"`,
    "Cache-Control": "no-store",
  });

  if (format === "svg") return new Response(svg, { headers: headers("image/svg+xml", "svg") });

  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  if (format === "png") return new Response(new Uint8Array(png), { headers: headers("image/png", "png") });

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4 in points
  const img = await pdf.embedPng(png);
  const side = 340;
  page.drawImage(img, { x: (595.28 - side) / 2, y: 841.89 - 120 - side, width: side, height: side });
  const bytes = await pdf.save();
  return new Response(new Uint8Array(bytes), { headers: headers("application/pdf", "pdf") });
}
