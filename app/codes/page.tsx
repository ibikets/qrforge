import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import SavedCodeList, { type ListedCode } from "@/components/SavedCodeList";
import RetryButton from "@/components/RetryButton";
import { LinkButton } from "@/components/ui/Button";
import { PLANS } from "@/lib/plans";
import { getSession, supabaseServer } from "@/lib/supabase";

export const metadata: Metadata = { title: "My codes" };

async function List() {
  const { userId, plan } = await getSession();
  if (!userId) redirect("/login?next=/codes");
  const sb = await supabaseServer();
  const { data, error } = await sb
    .from("qr_codes")
    .select("id,name,type,fields,style,created_at,updated_at")
    .order("updated_at", { ascending: false });
  if (error) {
    return (
      <div role="alert" className="rounded-panel bg-surface p-8">
        <h2 className="mb-2 text-2xl font-medium">We couldn’t load your saved codes</h2>
        <p className="mb-6 text-muted">Try again. Your saved codes have not been deleted.</p>
        <RetryButton />
      </div>
    );
  }
  return <SavedCodeList codes={(data ?? []) as ListedCode[]} planName={PLANS[plan].name} max={PLANS[plan].maxSaved} />;
}

export default function Codes() {
  return (
    <div className="mx-auto max-w-[1280px] px-5 py-8 sm:px-10 sm:py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-3 text-[28px] font-semibold leading-tight tracking-[-0.9px] sm:text-[40px]">My codes</h1>
          <p className="mb-6 text-lg text-muted">Your saved work, ready for the next handoff.</p>
        </div>
        <LinkButton href="/create">Create a code</LinkButton>
      </div>
      <Suspense
        fallback={
          <div aria-busy="true">
            <p role="status" className="mb-4 text-muted">Loading your saved codes…</p>
            {[0, 1, 2].map((i) => (
              <div key={i} className="my-3 h-20 rounded-control bg-disabled" />
            ))}
          </div>
        }
      >
        <List />
      </Suspense>
    </div>
  );
}
