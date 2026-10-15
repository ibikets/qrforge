import { adm } from "@/lib/admin/db";
import { LINK_COLS, newSlug, summarise, type Daily, type LinkRow } from "@/lib/links";
import { jerr, UUID, isMissingTable } from "@/lib/pages/server";
import { PLANS, type PlanId } from "@/lib/plans";
import { forbidden, rateLimit, sameOrigin } from "@/lib/request-guards";
import { getSession, supabaseConfigured } from "@/lib/supabase";

export { jerr };
export const siteHost = (req: Request) => { try { return new URL(process.env.VERCEL_ENV === "preview" ? req.url : process.env.NEXT_PUBLIC_SITE_URL ?? req.url).host; } catch { return undefined; } };

/** Authenticated customer for a link route. `needsPlan` is for changes that create or redirect traffic; pausing and deleting stay open on a lapsed plan. */
export async function linkCustomer(req: Request, name: string, limit = 60, needsPlan = true) {
  if (!sameOrigin(req)) return { response: forbidden() };
  if (!supabaseConfigured || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { response: jerr(503, "Dynamic links are not available in this environment.", { code: "unconfigured" }) };
  const s = await getSession();
  if (!s.userId) return { response: jerr(401, "Please sign in.") };
  const limited = rateLimit(req, name, limit, 60_000, s.userId);
  if (limited) return { response: limited };
  if (needsPlan && PLANS[s.plan].maxLinks === 0) return { response: jerr(403, "Your plan does not include dynamic links. Choose Pro or Business to create and edit them.", { code: "plan" }) };
  return { userId: s.userId, plan: s.plan as PlanId };
}

export async function ownedLink(id: string, userId: string): Promise<LinkRow | null> {
  if (!UUID.test(id)) return null;
  const { data } = await adm().from("links").select(LINK_COLS).eq("id", id).eq("user_id", userId).is("deleted_at", null).maybeSingle();
  return (data as LinkRow | null) ?? null;
}

export async function insertLink(userId: string, name: string, destination: string) {
  for (let i = 0; i < 5; i++) {
    const { data, error } = await adm().from("links").insert({ user_id: userId, name, destination, slug: newSlug() }).select(LINK_COLS).single();
    if (!error) return { row: data as LinkRow };
    if (error.code === "23505") continue; // slug collision: draw again
    return { error };
  }
  return { error: { code: "collision", message: "slug" } };
}
export const missingTable = isMissingTable;

export async function loadStats(linkId: string) {
  const since = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);
  const { data } = await adm().from("link_daily").select("day,device,target,bot,opens").eq("link_id", linkId).gte("day", since).limit(5000);
  return summarise((data ?? []) as Daily[]);
}
