import { forbidden, rateLimit, readJson, sameOrigin } from "@/lib/request-guards";
import { safeStaffNext } from "@/lib/staff-auth";
import { staffServer } from "@/lib/staff-server";
import { staffStanding, validEmail } from "@/lib/admin/staff-access";
import { STAFF_ACTIVE_COOKIE } from "@/lib/staff-auth";

import { cookies } from "next/headers";

const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const NEUTRAL = "Email or password is not correct.";

/**
 * Staff sign-in: email and password through the existing auth provider, into the STAFF session only.
 * Accounts that are not staff (customers, Google-only accounts, unknown emails) get the same neutral failure and
 * are signed straight back out, so a correct customer password never yields a staff session.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const parsed = await readJson(req, 2000);
  const b = parsed && "body" in parsed ? (parsed.body as { email?: unknown; password?: unknown; next?: unknown } | null) : null;
  const email = typeof b?.email === "string" ? b.email.trim().toLowerCase() : "";
  const password = b?.password;
  if (!validEmail(email) || typeof password !== "string" || password.length < 1 || password.length > 256) return json(400, { error: "Enter your email address and password.", field: !validEmail(email) ? "email" : "password" });
  const limited = rateLimit(req, "staff-login", 20, 60_000) ?? rateLimit(req, "staff-login-email", 6, 5 * 60_000, email);
  if (limited) return limited;

  const sb = await staffServer();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.user) return json(401, { error: NEUTRAL });
  const standing = await staffStanding(email);
  if (standing === "none") {
    await sb.auth.signOut({ scope: "local" });
    return json(401, { error: NEUTRAL });
  }
  (await cookies()).set(STAFF_ACTIVE_COOKIE, String(Date.now()), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  return json(200, { ok: true, next: safeStaffNext(typeof b?.next === "string" ? b.next : null) });
}
