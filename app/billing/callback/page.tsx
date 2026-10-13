import { Suspense } from "react";
import Link from "next/link";
import { activateFromReference } from "@/lib/paystack";
import { PLANS } from "@/lib/plans";

async function Result({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const ref = typeof sp.reference === "string" ? sp.reference : "";
  const result = ref ? await activateFromReference(ref) : { ok: false as const, plan: undefined };
  return (
    <>
      <h1 className="text-2xl font-semibold">{result.ok ? "Payment received" : "We couldn't confirm your payment"}</h1>
      <p className="mt-3 text-neutral-600">
        {result.ok && result.plan
          ? `Your ${PLANS[result.plan].name} plan is active for 30 days.`
          : "If you were charged, your plan will activate within a few minutes. Contact support with your Paystack receipt if not."}
      </p>
    </>
  );
}

export default function Callback(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <main className="mx-auto max-w-md px-6 py-24 text-center">
      <Suspense fallback={<p className="text-neutral-600">Confirming your payment…</p>}>
        <Result searchParams={props.searchParams} />
      </Suspense>
      <Link href="/" className="mt-8 inline-block rounded-lg bg-neutral-900 px-5 py-2.5 text-white">
        Back to the generator
      </Link>
    </main>
  );
}
