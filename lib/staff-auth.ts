import { createBrowserClient } from "@supabase/ssr";

/**
 * Staff sign-in lives in its OWN session, stored under its own cookie name, so a customer session (password or Google)
 * can never be read as a staff session and signing out of one never touches the other. Same identity provider, separate
 * session. The name is deliberately brand-neutral and never shown to users.
 */
export const STAFF_COOKIE = "qrf-staff-auth";
/** httpOnly cookie holding the time (ms) of the last staff activity. Separate from the customer clock. */
export const STAFF_ACTIVE_COOKIE = "qrf-staff-active";

export const staffCookieOptions = () => ({
  name: STAFF_COOKIE,
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
});

/** Browser client for the STAFF session. */
export function staffBrowser() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    db: { schema: "qrforge" },
    cookieOptions: { name: STAFF_COOKIE, path: "/", sameSite: "lax", secure: typeof location !== "undefined" && location.protocol === "https:" },
  });
}

export type AmrEntry = { method: string; timestamp: number };

/** Decode the claims of an access token that getUser() has ALREADY verified with the auth server. */
export function claimsOf(token: string | undefined): { aal?: string; amr: AmrEntry[] } {
  try {
    const c = JSON.parse(Buffer.from((token ?? "").split(".")[1] ?? "", "base64url").toString("utf8"));
    const amr = Array.isArray(c.amr) ? c.amr.filter((a: unknown): a is AmrEntry => typeof (a as AmrEntry)?.method === "string") : [];
    return { aal: typeof c.aal === "string" ? c.aal : undefined, amr };
  } catch {
    return { amr: [] };
  }
}

/** Staff must have signed in with a password. A session reached only through OAuth, magic link or recovery is not staff. */
export const hasPasswordLogin = (amr: AmrEntry[]) => amr.some((a) => a.method === "password");
/** Most recent real authentication (password or second factor) in this session, ms epoch. Drives step-up. */
export const lastAuthAt = (amr: AmrEntry[]) =>
  amr.filter((a) => a.method === "password" || a.method === "totp").reduce((m, a) => Math.max(m, (a.timestamp ?? 0) * 1000), 0);

/** Where to return after staff sign-in. Only /admin paths (and the invitation page) are allowed. */
export function safeStaffNext(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f]/.test(value)) return "/admin";
  if (value === "/admin" || value.startsWith("/admin/") || value.startsWith("/admin?") || value.startsWith("/staff-invite?")) {
    if (value.startsWith("/admin/login") || value.startsWith("/admin/reset-password") || value.startsWith("/admin/auth/")) return "/admin";
    return value;
  }
  return "/admin";
}
