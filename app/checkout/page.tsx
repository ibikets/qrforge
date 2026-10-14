import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import CheckoutPanel from "@/components/CheckoutPanel";
import { PLAN_RANK } from "@/lib/plans";
import { getSession } from "@/lib/supabase";

export const metadata: Metadata = { title: "Checkout" };

async function Body({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const plan = sp.plan === "pro" || sp.plan === "business" ? sp.plan : null;
  if (!plan) redirect("/pricing");
  const { email, plan: active } = await getSession();
  if (!email)
    redirect(`/login?next=${encodeURIComponent(`/checkout?plan=${plan}`)}`);
  if (PLAN_RANK[active] > PLAN_RANK[plan]) redirect("/pricing");
  return <CheckoutPanel plan={plan} email={email} />;
}

export default function Checkout({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <div className="mx-auto max-w-[1000px] px-5 py-8 sm:px-10 sm:py-12">
      <h1 className="mb-8 text-[28px] font-semibold leading-tight tracking-[-0.9px] sm:text-[40px]">
        Checkout
      </h1>
      <Suspense
        fallback={
          <div className="h-64 rounded-panel bg-disabled" aria-busy="true" />
        }
      >
        <Body searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
