import { randomUUID } from "node:crypto";
import { PLANS, PAID_PLANS, type PlanId } from "@/lib/plans";
import { supabaseServer } from "@/lib/supabase";
import { paystackHeaders } from "@/lib/paystack";

export async function POST(req: Request) {
  const { plan, autoRenew } = (await req.json()) as { plan: PlanId; autoRenew?: boolean };
  if (!PAID_PLANS.includes(plan)) return Response.json({ error: "Invalid plan" }, { status: 400 });

  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.email) return Response.json({ error: "Please sign in first" }, { status: 401 });

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  const res = await fetch("https://api.paystack.co/transaction/initialize", {
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
  const json = await res.json();
  if (!res.ok || !json.status) return Response.json({ error: json.message ?? "Paystack error" }, { status: 502 });
  return Response.json({ url: json.data.authorization_url });
}
