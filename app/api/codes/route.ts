import { PLANS } from "@/lib/plans";
import { FIELD_DEFS, QR_TYPES, type QrType } from "@/lib/qr";
import { validateContent } from "@/lib/qr-validation";
import { sanitizeStyle } from "@/lib/qr-render";
import { getSession, supabaseServer } from "@/lib/supabase";

const TYPE_IDS = QR_TYPES.map((t) => t.id as string);

/** Create (no id) or update (with id) a saved QR code. Limits are enforced here, server-side. */
export async function POST(req: Request) {
  const { userId, plan } = await getSession();
  if (!userId) return Response.json({ error: "Please sign in to save codes" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body))
    return Response.json({ error: "Bad request" }, { status: 400 });
  const name = String(body?.name ?? "").trim().slice(0, 80);
  const type = String(body?.type ?? "");
  const rawFields = body?.fields && typeof body.fields === "object" ? body.fields : {};
  const rawStyle = body?.style && typeof body.style === "object" ? body.style : {};
  const clean = sanitizeStyle(rawStyle);
  const size = Math.min(Math.max(Math.round(Number(rawStyle.size) || 512), 128), 4096);
  const style = { ...clean, size };
  const sentLogo = typeof rawStyle.logo === "string" && rawStyle.logo.length > 0;
  if (!name) return Response.json({ error: "Give your code a name before saving.", field: "name" }, { status: 400 });
  if (!TYPE_IDS.includes(type)) return Response.json({ error: "Invalid type" }, { status: 400 });
  if (sentLogo && !clean.logo)
    return Response.json({ error: "We couldn’t use that logo. Use a PNG, JPEG or WebP that fits the size limit." }, { status: 400 });

  const caps = PLANS[plan];
  style.size = Math.min(style.size, caps.maxSize);
  const def = QR_TYPES.find((t) => t.id === type)!;
  if (!def.basic && caps.types === "basic")
    return Response.json({ error: `${def.label} codes need a Pro plan` }, { status: 403 });
  if (style.logo && !caps.logo) return Response.json({ error: "Logos need a Pro plan" }, { status: 403 });

  // keep only the keys this type defines
  const fields: Record<string, string> = {};
  for (const d of FIELD_DEFS[type as QrType]) if (typeof rawFields[d.key] === "string") fields[d.key] = rawFields[d.key];
  const v = validateContent(type as QrType, fields);
  if (!v.ok) return Response.json({ error: v.errors[v.first], field: v.first }, { status: 400 });
  if (JSON.stringify(fields).length > 20_000) return Response.json({ error: "Too much data" }, { status: 413 });

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
      { error: `Your ${caps.name} plan saves up to ${caps.maxSaved} codes. Edit an existing code or choose a plan with more space.`, code: "limit" },
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
