"use client";

import { PLANS, PLAN_RANK, formatNaira, type PlanId } from "@/lib/plans";
import { LinkButton } from "@/components/ui/Button";
import UpgradeButton from "./UpgradeButton";

export type PricingView = {
  id: "pro" | "business";
  baseKobo: number;
  firstKobo: number;
  offerText?: string;
  audience?: "any" | "new_paid";
};

const rows: [string, (id: PlanId) => string][] = [
  [
    "QR types",
    (id) =>
      PLANS[id].types === "all" ? "All 8 types" : "Website, text, email",
  ],
  [
    "Downloads",
    (id) => PLANS[id].formats.map((f) => f.toUpperCase()).join(", "),
  ],
  ["Centre logo", (id) => (PLANS[id].logo ? "Yes" : "No")],
  ["Largest file", (id) => `${PLANS[id].maxSize.toLocaleString("en-US")} px`],
  ["Saved codes", (id) => PLANS[id].maxSaved.toLocaleString("en-US")],
];

export default function PricingGrid({
  current,
  signedIn,
  prices,
}: {
  current: PlanId;
  signedIn: boolean;
  prices: PricingView[];
}) {
  const ids = Object.keys(PLANS) as PlanId[];
  const view = (id: PlanId) => prices.find((p) => p.id === id);
  return (
    <>
      <p className="my-8 max-w-[720px] text-muted">
        You choose whether to renew automatically at checkout. Auto-renewal
        charges the card you pay with, at the price shown there, and you can
        cancel anytime from Billing.
      </p>

      <div className="mb-10 grid gap-6 min-[900px]:grid-cols-3">
        {ids.map((id) => {
          const p = PLANS[id];
          const featured = id === "pro";
          return (
            <section
              key={id}
              aria-labelledby={`plan-${id}`}
              className={`flex flex-col items-start gap-4 rounded-panel p-6 ${featured ? "bg-soft" : "bg-surface"}`}
            >
              <h2 id={`plan-${id}`} className="text-2xl font-medium">
                {p.name}
              </h2>
              <p className="text-muted">{p.blurb}</p>
              {(() => {
                const v = view(id);
                if (!v)
                  return (
                    <p className="text-[28px] font-semibold leading-tight">
                      {formatNaira(0)}
                    </p>
                  );
                const discounted = v.firstKobo < v.baseKobo;
                return discounted ? (
                  <div>
                    <p className="text-[28px] font-semibold leading-tight">
                      {formatNaira(v.firstKobo / 100)}{" "}
                      <span className="text-base font-normal text-muted">
                        for the first 30 days
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      <s>{formatNaira(v.baseKobo / 100)}</s> normal price. Then{" "}
                      {formatNaira(v.baseKobo / 100)} / 30 days if you renew.
                    </p>
                    {v.offerText ? (
                      <p className="mt-2 text-[13px] text-brand">
                        {v.offerText}.{" "}
                        {v.audience === "new_paid"
                          ? "For customers who have never paid. "
                          : ""}
                        First payment only.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-[28px] font-semibold leading-tight">
                    {formatNaira(v.baseKobo / 100)}
                    <span className="text-base font-normal text-muted">
                      {" "}
                      / 30 days
                    </span>
                  </p>
                );
              })()}
              <ul className="my-1 flex-1 list-disc pl-5">
                {p.features.map((f) => (
                  <li key={f} className="my-2">
                    {f}
                  </li>
                ))}
              </ul>
              <div className="w-full">
                {id === "free" ? (
                  <LinkButton
                    variant="secondary"
                    href="/create"
                    className="w-full"
                  >
                    Create for free
                  </LinkButton>
                ) : (
                  <UpgradeButton
                    plan={id}
                    signedIn={signedIn}
                    isCurrent={current === id}
                    included={PLAN_RANK[current] > PLAN_RANK[id]}
                  />
                )}
                {current === id ? (
                  <p className="mt-2 text-sm text-muted">Your current plan</p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      <h2 className="mb-4 text-2xl font-medium">Compare plans</h2>
      <div
        className="mb-10 overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="Plan comparison table"
      >
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
