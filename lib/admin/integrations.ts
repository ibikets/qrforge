import { PAYSTACK_API, paystackHeaders } from "@/lib/paystack";

export type Check = { name: string; state: "verified" | "failed" | "unverified"; detail: string; checkedAt: string | null };
const now = () => new Date().toISOString();

/** Real, read-only checks. Anything that can only be confirmed in a provider dashboard is reported as unverified, never green. */
export async function runChecks(): Promise<Check[]> {
  const out: Check[] = [];
  const supa = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supa || !anon) {
    out.push({ name: "Sign-in service", state: "failed", detail: "Not configured on this deployment.", checkedAt: now() });
  } else {
    try {
      const r = await fetch(`${supa}/auth/v1/settings`, { headers: { apikey: anon }, cache: "no-store", signal: AbortSignal.timeout(5000) });
      const j = (await r.json().catch(() => ({}))) as { external?: Record<string, boolean>; mailer_autoconfirm?: boolean };
      out.push(r.ok
        ? { name: "Sign-in service", state: "verified", detail: `Reachable at ${new URL(supa).host}. Google sign-in is ${j.external?.google ? "enabled" : "NOT enabled"}.`, checkedAt: now() }
        : { name: "Sign-in service", state: "failed", detail: `Answered with status ${r.status}.`, checkedAt: now() });
    } catch {
      out.push({ name: "Sign-in service", state: "failed", detail: "Could not be reached.", checkedAt: now() });
    }
  }
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    out.push({ name: "Payment provider", state: "failed", detail: "No payment key is configured on this deployment.", checkedAt: now() });
  } else {
    const mode = key.startsWith("sk_live_") ? "live" : key.startsWith("sk_test_") ? "test" : "unknown";
    try {
      const r = await fetch(`${PAYSTACK_API}/bank?perPage=1`, { headers: paystackHeaders(), cache: "no-store", signal: AbortSignal.timeout(5000) });
      out.push(r.ok
        ? { name: "Payment provider", state: "verified", detail: `Key accepted. Mode: ${mode}.`, checkedAt: now() }
        : { name: "Payment provider", state: "failed", detail: `Key rejected or service error (status ${r.status}). Mode: ${mode}.`, checkedAt: now() });
    } catch {
      out.push({ name: "Payment provider", state: "failed", detail: `Could not be reached. Mode: ${mode}.`, checkedAt: now() });
    }
  }
  return out;
}

export function presence() {
  const e = process.env;
  const site = e.NEXT_PUBLIC_SITE_URL ?? null;
  return {
    site,
    flags: [
      ["Database service key", Boolean(e.SUPABASE_SERVICE_ROLE_KEY)],
      ["Payment key", Boolean(e.PAYSTACK_SECRET_KEY)],
      ["Scheduled-job secret", Boolean(e.CRON_SECRET)],
      ["Site address", Boolean(site)],
      ["Owner sign-up email", Boolean(e.OWNER_BOOTSTRAP_EMAIL)],
      ["Second step required for staff", e.STAFF_MFA_REQUIRED !== "false"],
    ] as [string, boolean][],
  };
}
