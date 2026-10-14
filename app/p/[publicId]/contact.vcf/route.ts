import { adm } from "@/lib/admin/db";
import { buildVcf, readSnapshot } from "@/lib/pages/card";
import { PAGE_BUCKET, loadPublic, publicMedia } from "@/lib/pages/server";
import { rateLimit } from "@/lib/request-guards";

/** Downloadable contact for the PUBLISHED card: public rows only, with the small portrait when there is one (never the logo). */
export async function GET(req: Request, ctx: { params: Promise<{ publicId: string }> }) {
  const limited = rateLimit(req, "vcf", 60);
  if (limited) return limited;
  const { publicId } = await ctx.params;
  const r = await loadPublic(publicId).catch(() => null);
  const snap = r && r.state === "ok" ? readSnapshot(r.snapshot) : null;
  if (!snap) return new Response("This page isn’t available.", { status: 404, headers: { "Cache-Control": "no-store" } });
  let photo: Uint8Array | null = null;
  if (snap.portraitId) {
    const m = await publicMedia(publicId, snap.portraitId).catch(() => null);
    if (m?.vcf_path) { const f = await adm().storage.from(PAGE_BUCKET).download(m.vcf_path); if (!f.error && f.data) photo = new Uint8Array(await f.data.arrayBuffer()); }
  }
  const safe = snap.name.normalize("NFKD").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "contact";
  return new Response(buildVcf(snap, photo), { headers: { "Content-Type": "text/vcard; charset=utf-8", "Content-Disposition": `attachment; filename="${safe}.vcf"`, "Cache-Control": "public, max-age=300, s-maxage=300", "X-Content-Type-Options": "nosniff" } });
}
