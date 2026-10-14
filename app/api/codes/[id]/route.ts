import { getSession, supabaseServer } from "@/lib/supabase";
import { forbidden, sameOrigin } from "@/lib/request-guards";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return forbidden();
  const { userId } = await getSession();
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  const sb = await supabaseServer();
  // RLS also restricts this to the owner's rows
  const { data, error } = await sb.from("qr_codes").delete().eq("id", id).eq("user_id", userId).select("id");
  if (error) return Response.json({ error: "We couldn’t delete this code. Try again." }, { status: 500 });
  if (!data || data.length === 0) return Response.json({ error: "That code no longer exists." }, { status: 404 });
  return Response.json({ ok: true });
}
