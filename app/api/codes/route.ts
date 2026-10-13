import { PLANS } from "@/lib/plans";
import { QR_TYPES } from "@/lib/qr";
import { sanitizeStyle } from "@/lib/qr-render";
import { getSession, supabaseServer } from "@/lib/supabase";

const TYPE_IDS = QR_TYPES.map((t) => t.id as string);

/** Create (no id) or update (with id) a saved QR code. Limits are enforced here, server-side. */
export async function POST(req: Request) {
  const { userId, plan } = await getSession();
  if (!userId) return Response.json({ error: "Please sign in to save codes" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim().slice(0, 80);
  const type = String(body?.type ?? "");
  const fields = body?.fields && typeof body.fields === "object" ? body.fields : {};
  const rawStyle = body?.style && typeof body.style === "object" ? body.style : {};
  const clean = sanitizeStyle(rawStyle);
  const size = Math.min(Math.max(Math.round(Number(rawStyle.size) || 512), 128), 4096);
  const style = { ...clean, size };
  const sentLogo = typeof rawStyle.logo === "string" && rawStyle.logo.length > 0;
  if (!name) return Response.json({ error: "Give your code a name" }, { status: 400 });
  if (!TYPE_IDS.includes(type)) return Response.json({ error: "Invalid type" }, { status: 400 });
  if (sentLogo && !clean.logo)
    return Response.json({ error: "Logo must be a PNG, JPEG or WebP under ~100KB" }, { status: 400 });
  if (JSON.stringify(fields).length > 20_000) return Response.json({ error: "Too much data" }, { status: 413 });

  const caps = PLANS[plan];
  style.size = Math.min(style.size, caps.maxSize);
  const def = QR_TYPES.find((t) => t.id === type)!;
  if (!def.basic && caps.types === "basic")
    return Response.json({ error: `${def.label} codes need a Pro plan` }, { status: 403 });
  if (style.logo && !caps.logo) return Response.json({ error: "Logos need a Pro plan" }, { status: 403 });

  const sb = await supabaseServer();

  if (body.id) {
    const { data, error } = await sb
      .from("qr_codes")
      .update({ name, type, fields, style, updated_at: new Date().toISOString() })
      .eq("id", body.id)
      .select("id")
      .maybeSingle();
    if (error || !data) return Response.json({ error: "Could not update" }, { status: 404 });
    return Response.json({ id: data.id });
  }

  const { count } = await sb.from("qr_codes").select("id", { count: "exact", head: true });
  if ((count ?? 0) >= caps.maxSaved)
    return Response.json(
      { error: `Your ${caps.name} plan saves up to ${caps.maxSaved} codes. Upgrade for more.` },
      { status: 403 }
    );

  const { data, error } = await sb
    .from("qr_codes")
    .insert({ user_id: userId, name, type, fields, style })
    .select("id")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ id: data.id });
}
