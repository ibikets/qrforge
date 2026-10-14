import { PLANS } from "@/lib/plans";
import { QR_TYPES, allowedKeys, type QrType } from "@/lib/qr";
import { validateContent } from "@/lib/qr-validation";
import { sanitizeStyle } from "@/lib/qr-render";
import { getSession, supabaseServer } from "@/lib/supabase";
import { verifyLogo } from "@/lib/logo";
import { forbidden, rateLimit, readJson, sameOrigin } from "@/lib/request-guards";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TYPE_IDS = QR_TYPES.map((t) => t.id as string);

/** Create (no id) or update (with id) a saved QR code. Limits are enforced here, server-side. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const { userId, plan } = await getSession();
  if (!userId) return Response.json({ error: "Please sign in to save codes" }, { status: 401 });
  const limited = rateLimit(req, "codes", 30, 60_000, userId);
  if (limited) return limited;

  const parsed = await readJson(req);
  if (parsed && "tooLarge" in parsed) return Response.json({ error: "That request is too large." }, { status: 413 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = parsed && "body" in parsed ? (parsed.body as Record<string, any>) : null;
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
  if (sentLogo && (!clean.logo || !(await verifyLogo(clean.logo))))
    return Response.json({ error: "We couldn’t use that logo. Use a PNG, JPEG or WebP that fits the size limit." }, { status: 400 });

  const caps = PLANS[plan];
  style.size = Math.min(style.size, caps.maxSize);
  const def = QR_TYPES.find((t) => t.id === type)!;
  if (!def.basic && caps.types === "basic")
    return Response.json({ error: `${def.label} codes need a Pro plan` }, { status: 403 });
  if (style.logo && !caps.logo) return Response.json({ error: "Logos need a Pro plan" }, { status: 403 });

  // keep only the keys this type defines
  const fields: Record<string, string> = {};
  const allowed = allowedKeys(type as QrType);
  for (const k of Object.keys(rawFields)) if (allowed.has(k) && typeof rawFields[k] === "string") fields[k] = rawFields[k];
  const v = validateContent(type as QrType, fields);
  if (!v.ok) return Response.json({ error: v.errors[v.first], field: v.first }, { status: 400 });
  if (JSON.stringify(fields).length > 20_000) return Response.json({ error: "Too much data" }, { status: 413 });

  const sb = await supabaseServer();

  if (body.id) {
    if (typeof body.id !== "string" || !UUID.test(body.id)) return Response.json({ error: "Could not update" }, { status: 404 });
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
  if (error) {
    // database-level entitlement triggers (migration 20261014000000) answer with QF001..QF004
    if (error.code === "QF001")
      return Response.json(
        { error: `Your ${caps.name} plan saves up to ${caps.maxSaved} codes. Edit an existing code or choose a plan with more space.`, code: "limit" },
        { status: 403 }
      );
    if (error.code === "QF002" || error.code === "QF003" || error.code === "QF004")
      return Response.json({ error: "Your plan does not include that option." }, { status: 403 });
    return Response.json({ error: "We couldn’t save this code. Try again." }, { status: 500 });
  }
  return Response.json({ id: data.id });
}
