import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import AutoRenewToggle from "@/components/AutoRenewToggle";
import { PLANS, type PlanId } from "@/lib/plans";
import { getSession, supabaseServer } from "@/lib/supabase";

export const metadata = { title: "Billing · QRForge" };

const fmt = (d: string) => new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });

async function Details() {
  const { userId, plan } = await getSession();
  if (!userId) redirect("/login?next=/billing");
  const sb = await supabaseServer();
  const { data: sub } = await sb.from("subscriptions").select("plan, current_period_end, auto_renew").maybeSingle();
  const { data: pays } = await sb
    .from("payments")
    .select("reference, plan, amount_kobo, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  const active = sub && new Date(sub.current_period_end) > new Date();
  return (
    <>
      <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6">
        <p className="text-sm text-neutral-500">Current plan</p>
        <p className="text-2xl font-semibold">{PLANS[plan].name}</p>
        {active ? (
          <>
            <p className="mt-2 text-sm text-neutral-600">
              {sub.auto_renew
                ? `Renews automatically on ${fmt(sub.current_period_end)} at ₦${PLANS[sub.plan as PlanId].priceNgn.toLocaleString()}.`
                : `Active until ${fmt(sub.current_period_end)}. Auto-renewal is off, so it will not be charged again.`}
            </p>
            <div className="mt-4 flex items-center gap-3">
              <AutoRenewToggle enabled={sub.auto_renew} />
              <Link href="/pricing" className="text-sm underline">
                Change plan
              </Link>
            </div>
            <p className="mt-3 text-xs text-neutral-500">
              Auto-renewal charges the card you paid with. Pay by card (not transfer or USSD) when upgrading so it can be saved.
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-neutral-600">
            You are on the free plan.{" "}
            <Link href="/pricing" className="underline">
              See plans
            </Link>
          </p>
        )}
      </div>

      <h2 className="mt-8 text-lg font-semibold">Payment history</h2>
      {pays && pays.length > 0 ? (
        <ul className="mt-3 divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white">
          {pays.map((p) => (
            <li key={p.reference} className="flex justify-between px-5 py-3 text-sm">
              <span>
                {PLANS[p.plan as PlanId]?.name ?? p.plan} · {fmt(p.created_at)}
              </span>
              <span>₦{(p.amount_kobo / 100).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-neutral-600">No payments yet.</p>
      )}
    </>
  );
}

export default function Billing() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Billing</h1>
      <Suspense fallback={<div className="mt-6 h-40 animate-pulse rounded-2xl bg-neutral-200" />}>
        <Details />
      </Suspense>
    </main>
  );
}
