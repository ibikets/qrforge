import { createHash } from "node:crypto";
import { forbidden, rateLimit, readJson, sameOrigin } from "@/lib/request-guards";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase";
import { writeAudit } from "@/lib/admin/audit";
import { adm } from "@/lib/admin/db";
import type { Role } from "@/lib/admin/permissions";

const MESSAGE: Record<string, [number, string]> = {
  invalid: [404, "This invitation is not valid."],
  revoked: [410, "This invitation was cancelled. Ask the Owner to send a new one."],
  used: [409, "This invitation has already been used."],
  expired: [410, "This invitation has expired. Ask the Owner to send a new one."],
  wrong_account: [403, "Sign in with the email address the invitation was sent to."],
};

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const limited = rateLimit(req, "invite-accept", 10);
  if (limited) return limited;
  const parsed = await readJson(req, 2000);
  const token = parsed && "body" in parsed ? (parsed.body as { token?: unknown })?.token : null;
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return Response.json({ error: MESSAGE.invalid[1], code: "invalid" }, { status: 404 });
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user?.email || !user.email_confirmed_at) return Response.json({ error: "Sign in first." }, { status: 401 });
  const hash = createHash("sha256").update(token).digest("hex");
  const { data, error } = await supabaseAdmin().rpc("accept_invite", { p_token_hash: hash, p_user: user.id, p_email: user.email });
  if (error) return Response.json({ error: "Management is not available yet." }, { status: 503 });
  if (data !== "ok") {
    const [status, error] = MESSAGE[String(data)] ?? [400, "This invitation cannot be used."];
    return Response.json({ error, code: data }, { status });
  }
  const { data: m } = await adm().from("staff_members").select("role").eq("user_id", user.id).maybeSingle();
  await writeAudit({ userId: user.id, email: user.email.toLowerCase(), role: ((m as { role?: Role } | null)?.role ?? "support") as Role }, { action: "staff.invite_accepted", targetType: "staff", targetId: user.id });
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
