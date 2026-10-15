import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import NewCardForm from "@/components/pages/NewCardForm";
import { LinkButton } from "@/components/ui/Button";
import { PLANS } from "@/lib/plans";
import { getSession } from "@/lib/supabase";

export const metadata: Metadata = { title: "New page" };

async function Gate() {
  const { userId, plan } = await getSession();
  if (!userId) redirect("/login?next=/workspace/pages/new");
  if (PLANS[plan].maxPages === 0)
    return (
      <div role="status" className="max-w-[560px] rounded-panel bg-surface p-6">
        <h2 className="mb-2 text-xl font-medium">Hosted pages need Pro or Business</h2>
        <p className="mb-4 text-muted">Your {PLANS[plan].name} plan keeps all your static QR codes as they are. Hosted pages you can edit after printing are part of Pro and Business.</p>
        <LinkButton href="/pricing">See plans</LinkButton>
      </div>
    );
  return <NewCardForm />;
}

export default function NewCard() {
  return (
    <div className="mx-auto max-w-[1280px] px-5 py-8 sm:px-10 sm:py-10">
      <h1 className="mb-3 text-[28px] font-semibold leading-tight tracking-[-0.9px] sm:text-[40px]">New page</h1>
      <p className="mb-6 text-lg text-muted">Choose a type. People open it from a link or QR code, and you can change it later without reprinting.</p>
      <Suspense fallback={<p role="status" className="text-muted">Loading…</p>}><Gate /></Suspense>
    </div>
  );
}
