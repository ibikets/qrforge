import { Suspense } from "react";
import { getSession } from "@/lib/supabase";
import PricingGrid from "@/components/PricingGrid";

export const metadata = { title: "Pricing · QRForge" };

async function Plans() {
  const { plan: current, email } = await getSession();
  return <PricingGrid current={current} signedIn={Boolean(email)} />;
}

export default function Pricing() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-14">
      <h1 className="text-center text-3xl font-semibold tracking-tight">Simple pricing</h1>
      <p className="mt-2 text-center text-neutral-600">Pay in Naira with card, bank transfer or USSD via Paystack.</p>
      <Suspense fallback={<div className="mt-10 h-80 animate-pulse rounded-2xl bg-neutral-200" />}>
        <Plans />
      </Suspense>
    </main>
  );
}
