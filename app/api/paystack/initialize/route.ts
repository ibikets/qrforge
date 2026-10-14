import { randomUUID } from "node:crypto";
import { PLANS, PAID_PLANS, PLAN_RANK, type PlanId } from "@/lib/plans";
import { getSession, supabaseServer } from "@/lib/supabase";
import { PAYSTACK_API, paystackHeaders } from "@/lib/paystack";
import { forbidden, rateLimit, sameOrigin } from "@/lib/request-guards";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const limited = rateLimit(req, "pay-init", 10);
  if (limited) return limited;
  const body = (await req.json().catch(() => null)) as {
    plan?: PlanId;
    autoRenew?: boolean;
  } | null;
  const plan = body?.plan as PlanId;
  const autoRenew = body?.autoRenew === true;
  if (!PAID_PLANS.includes(plan)) return Response.json({ error: "Invalid plan" }, { status: 400 });

  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.email) return Response.json({ error: "Please sign in first" }, { status: 401 });

  // a lower plan must not overwrite a higher one that is still active
  const { plan: active } = await getSession();
  if (PLAN_RANK[active] > PLAN_RANK[plan])
    return Response.json({ error: `Your ${PLANS[active].name} plan already includes everything in ${PLANS[plan].name}.` }, { status: 409 });

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  let res: Response;
  let json;
  try {
    res = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
      method: "POST",
      headers: paystackHeaders(),
      body: JSON.stringify({
        email: user.email,
        amount: PLANS[plan].priceNgn * 100, // kobo
        currency: "NGN",
        reference: `qrf_${randomUUID()}`,
        callback_url: `${origin}/billing/callback`,
        // a reusable authorisation is only issued for card payments, so restrict to card when renewing
        ...(autoRenew ? { channels: ["card"] } : {}),
        metadata: { user_id: user.id, plan, auto_renew: Boolean(autoRenew) },
      }),
    });
    json = await res.json();
  } catch {
    return Response.json({ error: "We couldn’t reach Paystack. Nothing was charged. Try again." }, { status: 502 });
  }
  if (!res.ok || !json.status || !json.data?.authorization_url)
    return Response.json(
      {
        error: "Paystack could not start this payment. Nothing was charged. Try again.",
      },
      { status: 502 },
    );
  return Response.json({ url: json.data.authorization_url });
}
