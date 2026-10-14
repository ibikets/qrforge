import { Suspense } from "react";
import {
  FaqBlock,
  PlansBlock,
  UsesBlock,
  type PlanTeaser,
} from "@/components/landing/Blocks";
import Workbench from "@/components/landing/Workbench";
import { getLanding } from "@/lib/landing-data";
import { displayPrice, getCatalog } from "@/lib/pricing";
import { PLANS } from "@/lib/plans";
import { assetUrl } from "@/lib/content";

async function Landing() {
  const [c, cat] = await Promise.all([getLanding(), getCatalog()]);
  const teasers: PlanTeaser[] = (["pro", "business"] as const).map((id) => {
    const d = displayPrice(cat, id);
    return {
      id,
      name: PLANS[id].name,
      baseNgn: d.baseKobo / 100,
      firstPriceNgn: d.firstKobo / 100,
      regularNgn: d.baseKobo / 100,
      blurb: c.plans[id],
      offer: d.offer
        ? `${d.offer.audience === "new_paid" ? "For customers who have never paid. " : ""}First payment only.`
        : undefined,
    };
  });
  // Only an automatic public offer is ever shown here; private and targeted offers never appear.
  const notice = cat.offers.find((o) =>
    teasers.some((t) => o.plans.includes(t.id) && t.firstPriceNgn < t.baseNgn),
  );
  return (
    <>
      <section
        aria-labelledby="hero-h"
        className="mx-auto mb-10 max-w-[900px] text-center"
      >
        {notice ? (
          <div className="mb-6">
            <p className="inline-block rounded-full bg-soft px-4 py-2 text-sm text-brand">
              {notice.text}
            </p>
            <p className="mt-2 text-[13px] text-muted">
              {notice.audience === "new_paid"
                ? "For customers who have never paid. "
                : ""}
              First payment only. Renewals are at the normal price.
            </p>
          </div>
        ) : null}
        <h1
          id="hero-h"
          className="mb-3 text-[32px] font-semibold leading-tight tracking-[-0.9px] sm:text-[40px] min-[1000px]:text-[48px] min-[1000px]:leading-[1.15]"
        >
          {c.hero.headline}
        </h1>
        <p className="text-lg text-muted">{c.hero.support}</p>
        {c.hero.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={assetUrl(c.hero.image.path)}
            alt={c.hero.image.alt}
            width={c.hero.image.width}
            height={c.hero.image.height}
            className="mx-auto mt-6 h-auto max-h-[280px] w-auto max-w-full rounded-panel"
          />
        ) : null}
      </section>
      <div className="mb-14">
        <Workbench cta={c.hero.cta} freeNote={c.hero.freeNote} />
      </div>
      <UsesBlock uses={c.uses} />
      <PlansBlock plans={teasers} />
      <FaqBlock faq={c.faq} />
    </>
  );
}

export default function Home() {
  return (
    <div className="mx-auto max-w-[1280px] px-5 py-8 sm:px-10 sm:py-10">
      <Suspense fallback={<div className="h-[560px]" aria-busy="true" />}>
        <Landing />
      </Suspense>
    </div>
  );
}
