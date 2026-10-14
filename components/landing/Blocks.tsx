import Link from "next/link";
import { LinkButton } from "@/components/ui/Button";
import type { Landing } from "@/lib/content";

/** Presentational blocks shared by the public landing page and the editor preview. No data fetching here. */

export function UsesBlock({ uses }: { uses: Landing["uses"] }) {
  return (
    <section aria-labelledby="uses-h" className="mb-14">
      <h2 id="uses-h" className="mb-5 text-2xl font-medium">Popular uses</h2>
      <ul className="m-0 grid list-none grid-cols-1 gap-x-6 p-0 sm:grid-cols-2 min-[1000px]:grid-cols-4">
        {uses.map((u) => (
          <li key={u.title} className="border-b border-divider py-4">
            <h3 className="mb-1 text-lg font-medium">{u.title}</h3>
            <p className="text-sm text-muted">{u.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export type PlanTeaser = { id: "pro" | "business"; name: string; firstPriceNgn: number; regularNgn: number; baseNgn: number; blurb: string; offer?: string };
const naira = (n: number) => `₦${n.toLocaleString("en-US")}`;

/** Prices come from the plan versions and any live public offer, never from editable text. */
export function PlansBlock({ plans }: { plans: PlanTeaser[] }) {
  return (
    <section aria-labelledby="plans-h" className="mb-14">
      <h2 id="plans-h" className="mb-5 text-2xl font-medium">Simple plans for more needs</h2>
      <div className="grid gap-5 sm:grid-cols-2">
        {plans.map((p) => (
          <article key={p.id} className="flex flex-col items-start gap-1 rounded-panel bg-soft p-6">
            <h3 className="mb-1 text-xl font-medium">{p.name}</h3>
            <p className="mb-4 text-muted">{p.blurb}</p>
            {p.firstPriceNgn < p.baseNgn ? (
              <>
                <p className="text-[28px] font-semibold">
                  {naira(p.firstPriceNgn)} <span className="text-base font-normal text-muted">for the first 30 days</span>
                </p>
                <p className="text-sm text-muted">
                  <s>{naira(p.baseNgn)}</s> normal price. Then {naira(p.regularNgn)} / 30 days if you renew.
                </p>
                {p.offer ? <p className="mt-2 text-[13px] text-brand">{p.offer}</p> : null}
              </>
            ) : (
              <p className="text-[28px] font-semibold">
                {naira(p.baseNgn)} <span className="text-base font-normal text-muted">/ 30 days</span>
              </p>
            )}
            <LinkButton href="/pricing" variant="secondary" className="mt-4" aria-label={`View ${p.name} plan`}>
              View plan
            </LinkButton>
          </article>
        ))}
      </div>
      <p className="mt-4 text-sm">
        <Link href="/pricing" className="font-medium text-brand">Compare all plans</Link>
      </p>
    </section>
  );
}

export function FaqBlock({ faq }: { faq: Landing["faq"] }) {
  if (!faq.length) return null;
  return (
    <section aria-labelledby="faq-h" className="mb-14 max-w-[800px]">
      <h2 id="faq-h" className="mb-3 text-2xl font-medium">Frequently asked questions</h2>
      {faq.map((f, i) => (
        <details key={f.q} open={i === 0} className="border-b border-divider py-4">
          <summary className="cursor-pointer font-medium">{f.q}</summary>
          <p className="mt-2 text-muted">{f.a}</p>
        </details>
      ))}
    </section>
  );
}
