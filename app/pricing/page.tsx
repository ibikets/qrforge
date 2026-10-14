import type { Metadata } from "next";
import { Suspense } from "react";
import { getSession } from "@/lib/supabase";
import PricingGrid, { type PricingView } from "@/components/PricingGrid";
import { displayPrice, getCatalog } from "@/lib/pricing";

export const metadata: Metadata = { title: "Pricing" };

async function Plans() {
  const { plan: current, email } = await getSession();
  const cat = await getCatalog();
  const prices: PricingView[] = (["pro", "business"] as const).map((id) => {
    const d = displayPrice(cat, id);
    return {
      id,
      baseKobo: d.baseKobo,
      firstKobo: d.firstKobo,
      offerText: d.offer?.text,
      audience: d.offer?.audience,
    };
  });
  return (
    <PricingGrid current={current} signedIn={Boolean(email)} prices={prices} />
  );
}

export default function Pricing() {
  return (
    <div className="mx-auto max-w-[1100px] px-5 py-8 sm:px-10 sm:py-12">
      <h1 className="mb-3 text-[28px] font-semibold leading-tight tracking-[-0.9px] sm:text-[40px]">
        Clear pricing. Pay in Naira.
      </h1>
      <p className="max-w-[640px] text-lg text-muted">
        Choose a 30-day pass. Auto-renewal is optional.
      </p>
      <p className="mt-2 max-w-[640px] text-sm text-muted">
        Payments are processed securely by Paystack.
      </p>
      <Suspense
        fallback={
          <div
            className="mt-10 h-80 rounded-panel bg-disabled"
            aria-busy="true"
          />
        }
      >
        <Plans />
      </Suspense>
    </div>
  );
}
