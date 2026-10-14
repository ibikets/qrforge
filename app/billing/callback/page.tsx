import type { Metadata } from "next";
import { Suspense } from "react";
import ReturnToDraft from "@/components/ReturnToDraft";
import RetryButton from "@/components/RetryButton";
import { LinkButton } from "@/components/ui/Button";
import { activateFromReference, recordPaymentEvent } from "@/lib/paystack";
import { PLANS, formatNaira } from "@/lib/plans";
import { getSession } from "@/lib/supabase";

export const metadata: Metadata = { title: "Payment" };
const fmt = (d: string) =>
  new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

async function Result({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const ref =
    typeof sp.reference === "string"
      ? sp.reference
      : typeof sp.trxref === "string"
        ? sp.trxref
        : "";
  const r = ref ? await activateFromReference(ref) : null;
  const { userId } = await getSession();
  // History for the management screen: only for a signed-in customer's return, so anonymous visits cannot fill it.
  if (r && userId && r.state !== "failed") await recordPaymentEvent(ref, "callback", r.state);
  else if (r && userId) await recordPaymentEvent(ref, "callback", "failed");

  if (r?.state === "confirmed" && r.plan) {
    // The actual expiry is shown only to the person who paid.
    const mine = r.userId && r.userId === userId;
    return (
      <>
        <h1 className="mb-3 text-[28px] font-semibold sm:text-[32px]">
          Payment received
        </h1>
        <p className="mb-8 text-muted">
          {mine && r.periodEnd
            ? `Your ${PLANS[r.plan].name} plan is active until ${fmt(r.periodEnd)}.`
            : `Your ${PLANS[r.plan].name} plan is active.`}
        </p>
        {mine && r.paidKobo ? (
          <p className="-mt-5 mb-8 text-sm text-muted">
            Paid {formatNaira(r.paidKobo / 100)}
            {r.savedKobo
              ? `. You saved ${formatNaira(r.savedKobo / 100)} on this first payment.`
              : "."}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-center gap-3">
          <ReturnToDraft />
          <LinkButton variant="secondary" href="/create">
            Create a code
          </LinkButton>
          <LinkButton variant="ghost" href="/billing">
            View billing
          </LinkButton>
        </div>
      </>
    );
  }
  if (!r || r.state === "failed") {
    return (
      <>
        <h1 className="mb-3 text-[28px] font-semibold sm:text-[32px]">
          We couldn’t confirm your payment
        </h1>
        <p className="mb-4 text-muted">
          If you were charged, keep your Paystack receipt and reference, and
          don’t pay again until the status is clear.
        </p>
        {ref ? (
          <p className="mb-6 break-all text-sm text-muted">Reference: {ref}</p>
        ) : null}
        <div className="flex flex-wrap justify-center gap-3">
          {ref ? <RetryButton label="Check again" /> : null}
          <LinkButton variant="ghost" href="/billing">
            View billing
          </LinkButton>
        </div>
      </>
    );
  }
  return (
    <>
      <h1 className="mb-3 text-[28px] font-semibold sm:text-[32px]">
        We’re confirming your payment
      </h1>
      <p className="mb-4 text-muted">
        If you were charged, do not pay again. Check your plan shortly.
      </p>
      <p className="mb-6 break-all text-sm text-muted">Reference: {ref}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <RetryButton label="Check again" />
        <LinkButton variant="ghost" href="/billing">
          View billing
        </LinkButton>
      </div>
    </>
  );
}

export default function Callback(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <div className="mx-auto max-w-[520px] px-5 py-16 text-center sm:py-24">
      <Suspense
        fallback={
          <h1 role="status" className="text-[28px] font-semibold">
            Verifying your payment…
          </h1>
        }
      >
        <Result searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
