import { getSession, supabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
  const { userId } = await getSession();
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { enabled } = (await req.json().catch(() => ({}))) as { enabled?: boolean };
  if (typeof enabled !== "boolean") return Response.json({ error: "Bad request" }, { status: 400 });

  const { data } = await supabaseAdmin()
    .from("subscriptions")
    .update({ auto_renew: enabled, failed_attempts: 0, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .select("user_id")
    .maybeSingle();
  if (!data) return Response.json({ error: "No active subscription" }, { status: 404 });
  return Response.json({ ok: true });
}
