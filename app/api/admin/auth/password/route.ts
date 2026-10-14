import { forbidden, rateLimit, readJson, sameOrigin } from "@/lib/request-guards";
import { staffServer } from "@/lib/staff-server";
import { validStaffPassword, staffStanding } from "@/lib/admin/staff-access";
import { writeAudit } from "@/lib/admin/audit";

const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Set the staff password from a recovery link. Needs the recovery session that /admin/auth/callback created in the STAFF
 * session, and the account must still be eligible. Afterwards the recovery session is ended: the person signs in with the
 * new password and completes the second step like anyone else.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const limited = rateLimit(req, "staff-password", 6, 15 * 60_000);
  if (limited) return limited;
  const parsed = await readJson(req, 2000);
  const password = parsed && "body" in parsed ? (parsed.body as { password?: unknown } | null)?.password : null;
  if (!validStaffPassword(password)) return json(422, { error: "Use at least 12 characters.", field: "password" });
  const sb = await staffServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user?.email) return json(401, { error: "This link has expired. Ask for a new one.", code: "expired" });
  const standing = await staffStanding(user.email);
  if (standing !== "active" && standing !== "invited" && standing !== "owner_pending") {
    await sb.auth.signOut({ scope: "local" });
    return json(403, { error: "This account cannot be used for management." });
  }
  const { error } = await sb.auth.updateUser({ password });
  if (error) {
    const same = /same|different/i.test(error.message);
    const weak = /weak|short|at least|characters/i.test(error.message);
    return json(422, { error: same ? "Choose a password you have not used before." : weak ? "That password is too weak. Use a longer one." : "Could not set the password. Ask for a new link and try again.", field: "password" });
  }
  await writeAudit(null, { action: "staff.password_set", targetType: "staff", targetId: user.id, after: { email: user.email.toLowerCase() } });
  await sb.auth.signOut({ scope: "local" });
  return json(200, { ok: true });
}
