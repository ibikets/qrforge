import { cacheLife, cacheTag } from "next/cache";
import { PLANS, PAID_PLANS, type PlanId } from "@/lib/plans";
import { savingKobo } from "@/lib/admin/campaign-view";
import { PLAN_TAG } from "@/lib/admin/consts";
import { supabaseAdmin } from "@/lib/supabase";

export type PublicOffer = {
  slug: string;
  plans: PlanId[];
  text: string;
  audience: "any" | "new_paid";
  endsAt: string;
  kind: "percent" | "fixed";
  basisPoints: number | null;
  fixedKobo: number | null;
};
export type Catalog = {
  /** base price per paid plan in kobo (published plan version, else the built-in price) */
  base: Record<"pro" | "business", number>;
  /** automatic public offers shown on the website. Private and targeted offers are never included. */
  offers: PublicOffer[];
  source: "database" | "built-in";
};

type Row = {
  slug: string;
  plans: string[];
  banner_text: string;
  audience: "any" | "new_paid";
  ends_at: string;
  discount_kind: "percent" | "fixed";
  basis_points: number | null;
  fixed_kobo: number | null;
};
export const PUBLIC_OFFERS_TAG = "public-offers";

const builtIn = (): Catalog["base"] => ({
  pro: PLANS.pro.priceNgn * 100,
  business: PLANS.business.priceNgn * 100,
});

/** Public price list. Reads published data only; any failure falls back to the built-in prices and no offers. */
export async function getCatalog(): Promise<Catalog> {
  "use cache";
  cacheLife("minutes");
  cacheTag(PLAN_TAG, PUBLIC_OFFERS_TAG);
  try {
    const db = supabaseAdmin();
    const nowIso = new Date().toISOString();
    const base = builtIn();
    const pv = await db
      .from("plan_versions")
      .select("plan,base_kobo,effective_at,version")
      .eq("state", "published")
      .lte("effective_at", nowIso)
      .order("effective_at", { ascending: false })
      .order("version", { ascending: false });
    if (pv.error) return { base, offers: [], source: "built-in" };
    for (const p of ["pro", "business"] as const) {
      const hit = (pv.data as { plan: string; base_kobo: number }[]).find(
        (r) => r.plan === p,
      );
      if (hit) base[p] = hit.base_kobo;
    }
    const c = await db
      .from("campaigns")
      .select(
        "slug,plans,banner_text,audience,ends_at,discount_kind,basis_points,fixed_kobo,total_limit,id",
      )
      .eq("delivery", "public")
      .in("state", ["active", "scheduled"])
      .lte("starts_at", nowIso)
      .gt("ends_at", nowIso)
      .not("banner_text", "is", null)
      .order("priority", { ascending: false });
    const offers: PublicOffer[] = c.error
      ? []
      : (c.data as Row[]).map((x) => ({
          slug: x.slug,
          plans: (x.plans as string[]).filter((p) =>
            PAID_PLANS.includes(p as PlanId),
          ) as PlanId[],
          text: x.banner_text,
          audience: x.audience,
          endsAt: x.ends_at,
          kind: x.discount_kind,
          basisPoints: x.basis_points,
          fixedKobo: x.fixed_kobo,
        }));
    return { base, offers, source: "database" };
  } catch {
    return { base: builtIn(), offers: [], source: "built-in" };
  }
}

/** First payment for a plan under the best public offer (display only: the server quote at checkout is authoritative). */
export function displayPrice(cat: Catalog, plan: "pro" | "business") {
  const base = cat.base[plan];
  const offer = cat.offers.find((o) => o.plans.includes(plan));
  if (!offer)
    return {
      baseKobo: base,
      firstKobo: base,
      offer: undefined as PublicOffer | undefined,
    };
  const saving = savingKobo(
    {
      discount_kind: offer.kind,
      basis_points: offer.basisPoints,
      fixed_kobo: offer.fixedKobo,
    },
    base,
  );
  if (saving <= 0 || saving >= base)
    return { baseKobo: base, firstKobo: base, offer: undefined };
  return { baseKobo: base, firstKobo: base - saving, offer };
}

/** All prices a plan has legitimately had, so a payment started before a price change still verifies. */
export async function knownPlanPricesKobo(plan: PlanId): Promise<Set<number>> {
  const out = new Set<number>([PLANS[plan].priceNgn * 100]);
  try {
    const r = await supabaseAdmin()
      .from("plan_versions")
      .select("base_kobo")
      .eq("plan", plan)
      .in("state", ["published", "archived"]);
    if (!r.error)
      for (const x of r.data as { base_kobo: number }[]) out.add(x.base_kobo);
  } catch {
    /* built-in only */
  }
  return out;
}
