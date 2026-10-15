import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import AutoRenewToggle from "@/components/AutoRenewToggle";
import RetryButton from "@/components/RetryButton";
import { LinkButton } from "@/components/ui/Button";
import { PLANS, formatNaira, type PlanId } from "@/lib/plans";
import { getSession, supabaseAdmin, supabaseServer } from "@/lib/supabase";

export const metadata: Metadata = { title: "Billing" };

const fmt = (d: string) =>
  new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

async function Details() {
  const { userId } = await getSession();
  if (!userId) redirect("/login?next=%2Fbilling");
  const sb = await supabaseServer();
  // The signed-in session may read only the columns it has been granted (plan, period end, auto-renew; reference, plan,
  // amount, date). renewal_kobo and discount_kobo are not granted to it, so asking for them fails with 42501 and used to
  // take the whole page down. They are read separately, server-side, strictly for this user's own rows; the grants stay as they are.
  const subRes = (await sb.from("subscriptions").select("plan, current_period_end, auto_renew").maybeSingle()) as unknown as {
    data: { plan: string; current_period_end: string; auto_renew: boolean } | null;
    error: { code?: string } | null;
  };
  const payRes = (await sb
    .from("payments")
    .select("reference, plan, amount_kobo, created_at")
    .order("created_at", { ascending: false })
    .limit(10)) as unknown as {
    data: { reference: string; plan: string; amount_kobo: number; discount_kobo?: number; created_at: string }[] | null;
    error: { code?: string } | null;
  };
  if (subRes.error) {
    return (
      <div role="alert" className="rounded-panel bg-surface p-8">
        <h2 className="mb-2 text-2xl font-medium">
          We couldn’t load your billing details
        </h2>
        <p className="mb-6 text-muted">
          Try again. Nothing about your plan has changed.
        </p>
        <RetryButton />
      </div>
    );
  }
  const sub = subRes.data;
  const active = sub && new Date(sub.current_period_end) > new Date();
  // Only a boolean is derived; authorisation data stays server-side.
  let hasCard = false;
  if (sub && active) {
    const { data } = await supabaseAdmin()
      .from("subscriptions")
      .select("authorization_code")
      .eq("user_id", userId)
      .maybeSingle();
    hasCard = Boolean(data?.authorization_code);
  }
  const plan = sub?.plan as PlanId | undefined;
  // Agreed renewal price. If it cannot be read the price is left out rather than guessed.
  let renewKobo: number | null = plan ? PLANS[plan].priceNgn * 100 : 0;
  if (sub && active) {
    const r = await supabaseAdmin().from("subscriptions").select("renewal_kobo").eq("user_id", userId).maybeSingle();
    if (r.error) renewKobo = null;
    else if (r.data?.renewal_kobo) renewKobo = r.data.renewal_kobo as number;
  }
  // Offer savings per payment, for this user's listed payments only. Unknown savings are simply not shown.
  if (payRes.data?.length) {
    const d = await supabaseAdmin().from("payments").select("reference, discount_kobo").eq("user_id", userId).in("reference", payRes.data.map((p) => p.reference));
    if (!d.error) {
      const by = new Map((d.data ?? []).map((x: { reference: string; discount_kobo: number | null }) => [x.reference, x.discount_kobo ?? 0]));
      payRes.data = payRes.data.map((p) => ({ ...p, discount_kobo: by.get(p.reference) ?? 0 }));
    }
  }

  return (
    <>
      <section
        aria-labelledby="plan-h"
        className="rounded-panel bg-surface p-6"
      >
        <p className="text-sm text-muted">Current plan</p>
        <h2 id="plan-h" className="text-2xl font-semibold">
          {active && plan ? PLANS[plan].name : "Free"}
        </h2>
        {active && sub && plan ? (
          <>
            <p className="mt-3">
              {sub.auto_renew && hasCard
                ? `Renews automatically on ${fmt(sub.current_period_end)}${renewKobo != null ? ` at ${formatNaira(renewKobo / 100)}` : ""}.`
                : `Active until ${fmt(sub.current_period_end)}. ${sub.auto_renew ? "It will not renew automatically yet (see below)." : "Auto-renewal is off."}`}
            </p>
            {sub.auto_renew && !hasCard ? (
              <p className="mt-2 text-sm text-warning">
                Auto-renewal is switched on, but no reusable card is saved, so
                it can’t renew automatically. Pay by card to save one.
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap items-start gap-4">
              <AutoRenewToggle
                enabled={Boolean(sub.auto_renew && hasCard)}
                canEnable={hasCard}
              />
              <LinkButton variant="ghost" href="/pricing">
                Change plan
              </LinkButton>
            </div>
            <p className="mt-4 text-[13px] text-muted">
              Auto-renewal charges the card you paid with. Turning it off stops
              future charges; it does not refund a payment or end the access you
              have already paid for. Pay by card when choosing a plan so it can
              be saved.
            </p>
          </>
        ) : (
          <>
            <p className="mt-3 text-muted">
              {sub
                ? `Your ${PLANS[plan as PlanId]?.name ?? "paid"} plan ended on ${fmt(sub.current_period_end)}. You’re on Free. Your saved codes are still here; Free limits apply to new saves and downloads. Codes you already printed are not affected.`
                : "You’re on the Free plan."}
            </p>
            <div className="mt-5">
              <LinkButton href="/pricing">See plans</LinkButton>
            </div>
          </>
        )}
      </section>

      <h2 className="mb-2 mt-10 text-2xl font-medium">Payment history</h2>
      {payRes.error ? (
        <div role="alert" className="mt-3">
          <p className="mb-3 text-muted">
            We couldn’t load your payment history.
          </p>
          <RetryButton />
        </div>
      ) : payRes.data && payRes.data.length > 0 ? (
        <ul className="list-none p-0">
          {payRes.data.map((p) => (
            <li
              key={p.reference}
              className="flex justify-between gap-4 border-b border-divider py-4"
            >
              <span>
                {PLANS[p.plan as PlanId]?.name ?? p.plan} · {fmt(p.created_at)}
              </span>
              <span className="text-right">
                {formatNaira(p.amount_kobo / 100)}
                {p.discount_kobo ? (
                  <span className="block text-[13px] text-muted">
                    Saved {formatNaira(p.discount_kobo / 100)} with an offer
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-muted">No payments yet.</p>
      )}
    </>
  );
}

export default function Billing() {
  return (
    <div className="mx-auto max-w-[760px] px-5 py-8 sm:px-10 sm:py-10 min-[1000px]:mx-0">
      <h1 className="mb-3 text-[28px] font-semibold leading-tight tracking-[-0.9px] sm:text-[40px]">
        Billing
      </h1>
      <p className="mb-8 text-lg text-muted">
        Your plan, renewal preference and payment history.
      </p>
      <Suspense
        fallback={
          <div className="h-40 rounded-panel bg-disabled" aria-busy="true" />
        }
      >
        <Details />
      </Suspense>
    </div>
  );
}
