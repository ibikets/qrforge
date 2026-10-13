"use client";

import { useState } from "react";
import { PLANS, PLAN_RANK, formatNaira, type PlanId } from "@/lib/plans";
import { LinkButton } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import UpgradeButton from "./UpgradeButton";

const rows: [string, (id: PlanId) => string][] = [
  ["QR types", (id) => (PLANS[id].types === "all" ? "All 8 types" : "Website, text, email")],
  ["Downloads", (id) => PLANS[id].formats.map((f) => f.toUpperCase()).join(", ")],
  ["Centre logo", (id) => (PLANS[id].logo ? "Yes" : "No")],
  ["Largest file", (id) => `${PLANS[id].maxSize.toLocaleString("en-US")} px`],
  ["Saved codes", (id) => PLANS[id].maxSaved.toLocaleString("en-US")],
];

export default function PricingGrid({ current, signedIn }: { current: PlanId; signedIn: boolean }) {
  // Default stays checked (existing behaviour) until the owner decides otherwise.
  const [autoRenew, setAutoRenew] = useState(true);
  const ids = Object.keys(PLANS) as PlanId[];
  return (
    <>
      <div className="my-8 max-w-[720px]">
        <label className="flex items-start gap-3 rounded-panel bg-surface p-4">
          <input type="checkbox" className="mt-0.5 size-6 shrink-0" checked={autoRenew} onChange={(e) => setAutoRenew(e.target.checked)} />
          <span>
            <strong>Renew automatically every 30 days.</strong> I authorise QRForge to charge the card I pay with at each renewal, at the plan price shown. I
            can cancel anytime from Billing. (Card payments only.)
          </span>
        </label>
        <div role="status" aria-live="polite">
          {autoRenew ? (
            <Notice title="Card payments for auto-renewal">Turn renewal off to use other available Paystack payment methods.</Notice>
          ) : (
            <Notice title="One-off 30-day pass">Auto-renewal is off. Paystack will show the payment methods available to this merchant.</Notice>
          )}
        </div>
      </div>

      <div className="mb-10 grid gap-6 min-[900px]:grid-cols-3">
        {ids.map((id) => {
          const p = PLANS[id];
          const featured = id === "pro";
          return (
            <section key={id} aria-labelledby={`plan-${id}`} className={`flex flex-col items-start gap-4 rounded-panel p-6 ${featured ? "bg-soft" : "bg-surface"}`}>
              <h2 id={`plan-${id}`} className="text-2xl font-medium">
                {p.name}
              </h2>
              <p className="text-muted">{p.blurb}</p>
              <p className="text-[28px] font-semibold leading-tight">
                {p.priceNgn === 0 ? formatNaira(0) : formatNaira(p.priceNgn)}
                {p.priceNgn > 0 ? <span className="text-base font-normal text-muted"> / 30 days</span> : null}
              </p>
              <ul className="my-1 flex-1 list-disc pl-5">
                {p.features.map((f) => (
                  <li key={f} className="my-2">
                    {f}
                  </li>
                ))}
              </ul>
              <div className="w-full">
                {id === "free" ? (
                  <LinkButton variant="secondary" href="/create" className="w-full">
                    Create for free
                  </LinkButton>
                ) : (
                  <UpgradeButton plan={id} signedIn={signedIn} isCurrent={current === id} included={PLAN_RANK[current] > PLAN_RANK[id]} autoRenew={autoRenew} />
                )}
                {current === id ? <p className="mt-2 text-sm text-muted">Your current plan</p> : null}
              </div>
            </section>
          );
        })}
      </div>

      <h2 className="mb-4 text-2xl font-medium">Compare plans</h2>
      <div className="mb-10 overflow-x-auto" tabIndex={0} role="region" aria-label="Plan comparison table">
        <table className="w-full min-w-[520px] border-collapse text-left">
          <caption className="sr-only">Plan comparison</caption>
          <thead>
            <tr className="border-b border-divider">
              <th scope="col" className="py-3 pr-4 font-medium">
                <span className="sr-only">Feature</span>
              </th>
              {ids.map((id) => (
                <th key={id} scope="col" className="px-2 py-3 font-medium">
                  {PLANS[id].name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, f]) => (
              <tr key={label} className="border-b border-divider">
                <th scope="row" className="py-3 pr-4 font-medium text-muted">
                  {label}
                </th>
                {ids.map((id) => (
                  <td key={id} className="px-2 py-3">
                    {f(id)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
