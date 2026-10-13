"use client";

import { useState } from "react";
import { PLANS, type PlanId } from "@/lib/plans";
import UpgradeButton from "./UpgradeButton";

export default function PricingGrid({ current, signedIn }: { current: PlanId; signedIn: boolean }) {
  const [autoRenew, setAutoRenew] = useState(true);
  return (
    <>
      <label className="mx-auto mt-8 flex max-w-xl items-start gap-3 rounded-xl border border-neutral-200 bg-white p-4 text-sm">
        <input type="checkbox" className="mt-0.5" checked={autoRenew} onChange={(e) => setAutoRenew(e.target.checked)} />
        <span>
          <strong>Renew automatically every 30 days.</strong> I authorise QRForge to charge the card I pay with at each
          renewal, at the plan price shown. I can cancel anytime from Billing. (Card payments only.)
        </span>
      </label>
      <div className="mt-6 grid gap-6 md:grid-cols-3">
        {(Object.keys(PLANS) as PlanId[]).map((id) => {
          const p = PLANS[id];
          return (
            <div
              key={id}
              className={`flex flex-col rounded-2xl border bg-white p-6 ${id === "pro" ? "border-neutral-900" : "border-neutral-200"}`}
            >
              <h2 className="text-lg font-semibold">{p.name}</h2>
              <p className="text-sm text-neutral-500">{p.blurb}</p>
              <p className="mt-4 text-3xl font-semibold">
                {p.priceNgn === 0 ? "Free" : `₦${p.priceNgn.toLocaleString()}`}
                {p.priceNgn > 0 && <span className="text-sm font-normal text-neutral-500"> / 30 days</span>}
              </p>
              <ul className="mt-5 flex-1 space-y-2 text-sm text-neutral-700">
                {p.features.map((f) => (
                  <li key={f}>✓ {f}</li>
                ))}
              </ul>
              <div className="mt-6">
                {id === "free" ? (
                  <p className="text-sm text-neutral-500">{current === "free" ? "Your current plan" : ""}</p>
                ) : (
                  <UpgradeButton plan={id} signedIn={signedIn} isCurrent={current === id} autoRenew={autoRenew} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
