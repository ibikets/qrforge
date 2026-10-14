import { forbidden, rateLimit, sameOrigin } from "@/lib/request-guards";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase";
import { writeAudit } from "@/lib/admin/audit";

const no = (status: number, error: string) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Claim the first Owner seat. Requires ALL of: the caller is signed in with a confirmed email, that email equals the
 * server-side OWNER_BOOTSTRAP_EMAIL, and no staff exist yet (enforced atomically in the database).
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const limited = rateLimit(req, "admin-bootstrap", 5);
  if (limited) return limited;
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user?.email) return no(401, "Sign in first.");
  const owner = (process.env.OWNER_BOOTSTRAP_EMAIL ?? "").trim().toLowerCase();
  if (!owner || user.email.toLowerCase() !== owner || !user.email_confirmed_at) return no(403, "This account cannot set up management.");
  const { data, error } = await supabaseAdmin().rpc("bootstrap_owner", { p_user: user.id, p_email: user.email });
  if (error) return no(503, "Management is not available yet.");
  if (data !== true) return no(409, "Management already has an Owner.");
  await writeAudit({ userId: user.id, email: user.email.toLowerCase(), role: "owner" }, { action: "staff.bootstrap_owner", targetType: "staff", targetId: user.id });
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
