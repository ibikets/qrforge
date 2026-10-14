import { randomUUID } from "node:crypto";
import { PAID_PLANS, PLANS, PLAN_RANK, type PlanId } from "@/lib/plans";
import { hashOfferCode, normaliseOfferCode, OFFER_CODE_RE } from "@/lib/offers";
import {
  forbidden,
  rateLimit,
  readJson,
  sameOrigin,
} from "@/lib/request-guards";
import { getSession, supabaseAdmin, supabaseServer } from "@/lib/supabase";

const NO_STORE = { "Cache-Control": "no-store" };
const UNAVAILABLE =
  "This code is unavailable or does not apply to this purchase.";

/**
 * The server decides the price. The browser sends a plan and, optionally, an offer code; it never sends an amount or a percentage.
 * Returns an immutable quote (in kobo) that the payment must match exactly.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const limited = rateLimit(req, "quote", 30);
  if (limited) return limited;
  const parsed = await readJson(req, 2000);
  const body = (parsed && "body" in parsed ? parsed.body : null) as {
    plan?: unknown;
    code?: unknown;
    autoRenew?: unknown;
  } | null;
  const plan = body?.plan as PlanId;
  if (!PAID_PLANS.includes(plan))
    return Response.json(
      { error: "Invalid plan" },
      { status: 400, headers: NO_STORE },
    );

  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.email)
    return Response.json(
      { error: "Please sign in first" },
      { status: 401, headers: NO_STORE },
    );
  const { plan: active } = await getSession();
  if (PLAN_RANK[active] > PLAN_RANK[plan])
    return Response.json(
      {
        error: `Your ${PLANS[active].name} plan already includes everything in ${PLANS[plan].name}.`,
      },
      { status: 409, headers: NO_STORE },
    );

  let codeHash: string | null = null;
  if (typeof body?.code === "string" && body.code.trim()) {
    const c = normaliseOfferCode(body.code);
    if (!OFFER_CODE_RE.test(c))
      return Response.json(
        { error: UNAVAILABLE, code: "offer_unavailable" },
        { status: 422, headers: NO_STORE },
      );
    codeHash = hashOfferCode(c);
  }

  const db = supabaseAdmin();
  const { data, error } = await db.rpc("issue_quote", {
    p_user: user.id,
    p_plan: plan,
    p_code_hash: codeHash,
    p_idem: randomUUID(),
    p_auto_renew: body?.autoRenew !== false,
  });
  if (error) {
    if (/QF021/.test(error.message))
      return Response.json(
        { error: UNAVAILABLE, code: "offer_unavailable" },
        { status: 422, headers: NO_STORE },
      );
    // Offers are not installed yet (database update pending): the plain price, no quote id, original payment path.
    if (
      error.code === "PGRST202" ||
      error.code === "42883" ||
      /issue_quote|schema cache/i.test(error.message)
    ) {
      const kobo = PLANS[plan].priceNgn * 100;
      if (codeHash)
        return Response.json(
          { error: UNAVAILABLE, code: "offer_unavailable" },
          { status: 422, headers: NO_STORE },
        );
      return Response.json(
        {
          quote: {
            id: null,
            plan,
            baseKobo: kobo,
            savingKobo: 0,
            payableKobo: kobo,
            renewalKobo: kobo,
            periodDays: 30,
            offer: null,
          },
        },
        { headers: NO_STORE },
      );
    }
    console.error("quote failed", error.code);
    return Response.json(
      {
        error:
          "We couldn’t prepare your price. Nothing was charged. Try again.",
      },
      { status: 502, headers: NO_STORE },
    );
  }
  const q = data as {
    id: string;
    base_kobo: number;
    saving_kobo: number;
    payable_kobo: number;
    renewal_kobo: number;
    period_days: number;
    campaign_id: string | null;
  };
  let label: string | null = null;
  if (q.campaign_id && q.saving_kobo > 0) {
    const c = await db
      .from("campaigns")
      .select("banner_text,delivery")
      .eq("id", q.campaign_id)
      .maybeSingle();
    label =
      (c.data as { banner_text: string | null; delivery: string } | null)
        ?.banner_text ?? "Offer applied";
  }
  return Response.json(
    {
      quote: {
        id: q.id,
        plan,
        baseKobo: q.base_kobo,
        savingKobo: q.saving_kobo,
        payableKobo: q.payable_kobo,
        renewalKobo: q.renewal_kobo,
        periodDays: q.period_days,
        offer: label,
      },
    },
    { headers: NO_STORE },
  );
}
