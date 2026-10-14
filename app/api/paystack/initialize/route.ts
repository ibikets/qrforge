import { randomUUID } from "node:crypto";
import { PLANS, PAID_PLANS, PLAN_RANK, type PlanId } from "@/lib/plans";
import { getSession, supabaseAdmin, supabaseServer } from "@/lib/supabase";
import { PAYSTACK_API, paystackHeaders } from "@/lib/paystack";
import { forbidden, rateLimit, sameOrigin } from "@/lib/request-guards";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHANGED = "This offer changed. Review the updated total before paying.";

/**
 * Starts a payment for exactly the amount in a server-issued quote.
 * The amount is never taken from the browser, and Paystack's `plan` parameter is deliberately not used: it would
 * override the amount we send and charge the full price instead of the quoted one.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const limited = rateLimit(req, "pay-init", 10);
  if (limited) return limited;
  const body = (await req.json().catch(() => null)) as {
    plan?: PlanId;
    autoRenew?: boolean;
    quoteId?: string | null;
  } | null;
  const plan = body?.plan as PlanId;
  const autoRenew = body?.autoRenew === true;
  if (!PAID_PLANS.includes(plan))
    return Response.json({ error: "Invalid plan" }, { status: 400 });

  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.email)
    return Response.json({ error: "Please sign in first" }, { status: 401 });

  // a lower plan must not overwrite a higher one that is still active
  const { plan: active } = await getSession();
  if (PLAN_RANK[active] > PLAN_RANK[plan])
    return Response.json(
      {
        error: `Your ${PLANS[active].name} plan already includes everything in ${PLANS[plan].name}.`,
      },
      { status: 409 },
    );

  let amountKobo = PLANS[plan].priceNgn * 100;
  let reference = `qrf_${randomUUID()}`;
  let quoteId: string | null = null;

  if (body?.quoteId) {
    if (typeof body.quoteId !== "string" || !UUID.test(body.quoteId))
      return Response.json({ error: "Invalid request" }, { status: 400 });
    const db = supabaseAdmin();
    const { data: q, error } = await db
      .from("quotes")
      .select("id,user_id,plan,payable_kobo,state,reference,expires_at")
      .eq("id", body.quoteId)
      .maybeSingle();
    if (error || !q || q.user_id !== user.id || q.plan !== plan)
      return Response.json(
        { error: CHANGED, code: "quote_changed" },
        { status: 409 },
      );
    if (q.state === "paid")
      return Response.json(
        { error: "This payment was already completed.", code: "already_paid" },
        { status: 409 },
      );
    if (q.state === "initialised" && q.reference)
      reference = q.reference as string; // retrying the same checkout reuses its reference
    // the renewal choice made at payment time is the one recorded
    if (q.state === "open")
      await db
        .from("quotes")
        .update({ auto_renew: autoRenew })
        .eq("id", q.id)
        .eq("state", "open");
    const { data: r, error: re } = await db.rpc("reserve_redemption", {
      p_quote: q.id,
      p_reference: reference,
    });
    if (re)
      return Response.json(
        {
          error:
            "We couldn’t start this payment. Nothing was charged. Try again.",
        },
        { status: 502 },
      );
    if (r !== "ok")
      return Response.json(
        { error: CHANGED, code: "quote_changed" },
        { status: 409 },
      );
    amountKobo = q.payable_kobo as number;
    quoteId = q.id as string;
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  let res: Response;
  let json;
  try {
    res = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
      method: "POST",
      headers: paystackHeaders(),
      body: JSON.stringify({
        email: user.email,
        amount: amountKobo, // kobo, from the quote
        currency: "NGN",
        reference,
        callback_url: `${origin}/billing/callback`,
        // a reusable authorisation is only issued for card payments, so restrict to card when renewing
        ...(autoRenew ? { channels: ["card"] } : {}),
        metadata: {
          user_id: user.id,
          plan,
          auto_renew: Boolean(autoRenew),
          ...(quoteId ? { quote_id: quoteId } : {}),
        },
      }),
    });
    json = await res.json();
  } catch {
    return Response.json(
      { error: "We couldn’t reach Paystack. Nothing was charged. Try again." },
      { status: 502 },
    );
  }
  if (!res.ok || !json.status || !json.data?.authorization_url) {
    // Paystack refuses a reference it has already seen: the quote can no longer be reused
    if (quoteId && /duplicate/i.test(String(json?.message ?? "")))
      return Response.json(
        { error: CHANGED, code: "quote_changed" },
        { status: 409 },
      );
    return Response.json(
      {
        error:
          "Paystack could not start this payment. Nothing was charged. Try again.",
      },
      { status: 502 },
    );
  }
  return Response.json({ url: json.data.authorization_url });
}
