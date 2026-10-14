import { supabaseAdmin } from "@/lib/supabase";

export type Standing = "active" | "revoked" | "invited" | "owner_pending" | "none";

/** True when no staff exist yet and this is the one email the deployment's trusted configuration names as Owner. */
async function isPendingOwner(email: string): Promise<boolean> {
  const owner = (process.env.OWNER_BOOTSTRAP_EMAIL ?? "").trim().toLowerCase();
  if (!owner || owner !== email) return false;
  const { data, error } = await supabaseAdmin().from("staff_members").select("user_id").limit(1);
  return !error && (data?.length ?? 0) === 0;
}

/**
 * Where an email stands with management. Used by staff sign-in and staff recovery ONLY, and never echoed to the browser:
 * responses stay neutral so the form cannot be used to discover who is staff.
 */
export async function staffStanding(emailRaw: string): Promise<Standing> {
  const email = emailRaw.trim().toLowerCase();
  const db = supabaseAdmin();
  const { data: m } = await db.from("staff_members").select("state").eq("email", email).maybeSingle();
  if (m) return m.state === "active" ? "active" : "revoked";
  const { data: inv } = await db
    .from("staff_invites")
    .select("id")
    .eq("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .limit(1);
  if (inv && inv.length > 0) return "invited";
  if (await isPendingOwner(email)) return "owner_pending";
  return "none";
}

export const validEmail = (v: unknown): v is string => typeof v === "string" && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
/** Staff passwords: at least 12 characters, no upper limit that would block a passphrase (bounded at 128). */
export const STAFF_PASSWORD_MIN = 12;
export const validStaffPassword = (v: unknown): v is string => typeof v === "string" && v.length >= STAFF_PASSWORD_MIN && v.length <= 128;
