import { forbidden, rateLimit, readJson, sameOrigin } from "@/lib/request-guards";
import { staffServer } from "@/lib/staff-server";
import { staffStanding, validEmail } from "@/lib/admin/staff-access";
import { supabaseAdmin } from "@/lib/supabase";
import { siteOrigin } from "@/lib/site";
import { writeAudit } from "@/lib/admin/audit";

const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const NEUTRAL = { ok: true, message: "If that address has management access, a link to set a password is on its way. It expires soon." };

/**
 * Staff password recovery / first password. Always answers the same way. The email is sent only to an active staff member,
 * a person with an unused invitation, or the single Owner email named in trusted configuration while no Owner exists.
 * For that Owner email the sign-in account is created if absent and an existing Google-only account is kept as is:
 * setting a password adds email sign-in to it without touching its customer data.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const parsed = await readJson(req, 2000);
  const b = parsed && "body" in parsed ? (parsed.body as { email?: unknown } | null) : null;
  const email = typeof b?.email === "string" ? b.email.trim().toLowerCase() : "";
  if (!validEmail(email)) return json(400, { error: "Enter a valid email address.", field: "email" });
  const limited = rateLimit(req, "staff-recover", 10, 15 * 60_000) ?? rateLimit(req, "staff-recover-email", 3, 60 * 60_000, email);
  if (limited) return limited;

  try {
    const standing = await staffStanding(email);
    if (standing === "active" || standing === "invited" || standing === "owner_pending") {
      if (standing === "owner_pending") {
        // Provision the sign-in account for the configured Owner email if it does not exist yet (verified by the emailed link).
        // An existing account answers "already registered", which is exactly the case we keep untouched.
        await supabaseAdmin().auth.admin.createUser({ email, email_confirm: true });
      }
      const sb = await staffServer();
      const redirectTo = `${siteOrigin(req)}/admin/auth/callback?next=${encodeURIComponent("/admin/reset-password")}`;
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
      if (!error && standing === "owner_pending") await writeAudit(null, { action: "staff.owner_password_link_sent", targetType: "staff", after: { email } });
    }
  } catch (e) {
    console.error("staff recover failed", e instanceof Error ? e.message : e);
  }
  return json(200, NEUTRAL);
}
