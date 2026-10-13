import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { PlanId } from "./plans";

export const supabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/** Server client bound to the request's cookies (server components, route handlers) */
export async function supabaseServer() {
  // Session work reads the clock (token expiry). Opt out of prerender/prefetch rendering explicitly.
  await connection();
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: "qrforge" },
      cookies: {
        getAll: () => store.getAll(),
        setAll: (all) => {
          try {
            all.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // called from a Server Component: safe to ignore
          }
        },
      },
    }
  );
}

/** Service-role client: webhooks only. Never import into client code. */
export function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    db: { schema: "qrforge" },
    auth: { persistSession: false },
  });
}

/** Current user + active plan (falls back to free when signed out, expired, or unconfigured) */
export async function getSession(): Promise<{ userId: string | null; email: string | null; plan: PlanId }> {
  if (!supabaseConfigured) return { userId: null, email: null, plan: "free" };
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { userId: null, email: null, plan: "free" };
  const { data } = await sb
    .from("subscriptions")
    .select("plan, current_period_end")
    .eq("user_id", user.id)
    .maybeSingle();
  const active = data && new Date(data.current_period_end) > new Date();
  return { userId: user.id, email: user.email ?? null, plan: active ? (data!.plan as PlanId) : "free" };
}
