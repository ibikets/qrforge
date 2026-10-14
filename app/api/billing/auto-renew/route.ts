import { getSession, supabaseAdmin } from "@/lib/supabase";
import { forbidden, sameOrigin } from "@/lib/request-guards";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const { userId } = await getSession();
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { enabled } = (await req.json().catch(() => ({}))) as { enabled?: boolean };
  if (typeof enabled !== "boolean") return Response.json({ error: "Bad request" }, { status: 400 });

  const db = supabaseAdmin();
  if (enabled) {
    // Auto-renewal needs a saved reusable card. Only a boolean is derived; the code itself is never exposed.
    const { data: s } = await db.from("subscriptions").select("authorization_code").eq("user_id", userId).maybeSingle();
    if (!s) return Response.json({ error: "No active subscription" }, { status: 404 });
    if (!s.authorization_code)
      return Response.json({ error: "Pay by card to enable auto-renewal.", code: "no_card" }, { status: 409 });
  }
  const { data } = await db
    .from("subscriptions")
    .update({ auto_renew: enabled, failed_attempts: 0, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .select("user_id")
    .maybeSingle();
  if (!data) return Response.json({ error: "No active subscription" }, { status: 404 });
  return Response.json({ ok: true });
}
