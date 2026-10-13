import { getSession, supabaseServer } from "@/lib/supabase";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { userId } = await getSession();
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  const sb = await supabaseServer();
  // RLS also restricts this to the owner's rows
  const { error } = await sb.from("qr_codes").delete().eq("id", id).eq("user_id", userId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
