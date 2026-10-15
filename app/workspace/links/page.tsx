import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import NewLinkForm from "@/components/links/NewLinkForm";
import { LinkButton } from "@/components/ui/Button";
import { adm } from "@/lib/admin/db";
import { LINK_COLS, type LinkRow } from "@/lib/links";
import { PLANS } from "@/lib/plans";
import { getSession, supabaseConfigured } from "@/lib/supabase";

export const metadata: Metadata = { title: "Dynamic links" };

async function List() {
  const { userId, plan } = await getSession();
  if (!userId) redirect("/login?next=/workspace/links");
  const caps = PLANS[plan];
  if (!supabaseConfigured || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    return <div role="status" className="rounded-panel bg-surface p-6"><h2 className="mb-1 text-xl font-medium">Dynamic links aren’t available in this environment</h2><p className="text-muted">Link storage is not connected here.</p></div>;
  const { data, error } = await adm().from("links").select(LINK_COLS).eq("user_id", userId).is("deleted_at", null).order("updated_at", { ascending: false });
  if (error)
    return error.code === "42P01" || error.code === "PGRST205"
      ? <div role="status" className="rounded-panel bg-surface p-6"><h2 className="mb-1 text-xl font-medium">Dynamic links are not available yet</h2><p className="text-muted">They’re being set up. Your other QR codes are unaffected.</p></div>
      : <div role="alert" className="rounded-panel bg-surface p-6"><h2 className="mb-1 text-xl font-medium">We couldn’t load your links</h2><p className="text-muted">Try again in a moment. Nothing has been deleted.</p></div>;
  const rows = (data ?? []) as LinkRow[];
  return (
    <>
      {caps.maxLinks === 0 ? (
        <div className="mb-6 rounded-panel bg-surface p-6">
          <h2 className="mb-1 text-xl font-medium">Dynamic links need Pro or Business</h2>
          <p className="mb-4 text-muted">Your static QR codes keep working on every plan. Upgrade to make codes whose destination you can change after printing.</p>
          <LinkButton href="/pricing">See plans</LinkButton>
        </div>
      ) : (
        <>
          <p className="mb-4 text-muted">{rows.length} of {caps.maxLinks} dynamic links used on your {caps.name} plan.</p>
          {rows.length < caps.maxLinks ? <NewLinkForm /> : <p role="status" className="mb-6 rounded-control bg-soft p-3 text-sm">You’ve used every link on your plan. Delete one or choose a plan with more.</p>}
        </>
      )}
      {rows.length === 0 ? null : (
        <ul className="m-0 list-none divide-y divide-divider rounded-panel bg-surface p-0">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <Link href={`/workspace/links/${r.id}`} className="break-words text-lg font-medium text-brand">{r.name}</Link>
                <p className="break-all text-sm text-muted">{r.taken_down_at ? "Disabled by Qrenuvi" : r.state === "paused" ? "Paused" : "Active"} · goes to {r.destination}</p>
              </div>
              <LinkButton href={`/workspace/links/${r.id}`} variant="secondary">{caps.maxLinks > 0 ? "Edit" : "View"}</LinkButton>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function Links() {
  return (
    <div className="mx-auto max-w-[1280px] px-5 py-8 sm:px-10 sm:py-10">
      <h1 className="mb-3 text-[28px] font-semibold leading-tight tracking-[-0.9px] sm:text-[40px]">Dynamic links</h1>
      <p className="mb-6 max-w-[720px] text-lg text-muted">A QR code that always opens the same short address, while you decide where it goes. Change the destination any time, send phones to the right app store, or switch by day and time.</p>
      <Suspense fallback={<p role="status" className="text-muted">Loading your links…</p>}><List /></Suspense>
    </div>
  );
}
