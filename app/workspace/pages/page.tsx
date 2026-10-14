import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { LinkButton } from "@/components/ui/Button";
import { adm } from "@/lib/admin/db";
import { PAGE_COLS, isMissingTable, type PageRow } from "@/lib/pages/server";
import { PLANS } from "@/lib/plans";
import { getSession, supabaseConfigured } from "@/lib/supabase";

export const metadata: Metadata = { title: "Pages" };
const LIFE: Record<string, string> = { draft: "Draft", published: "Published", unpublished: "Unpublished", archived: "Archived" };

async function List({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { userId, plan } = await getSession();
  if (!userId) redirect("/login?next=/workspace/pages");
  const caps = PLANS[plan];
  if (!supabaseConfigured || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    return <div role="status" className="rounded-panel bg-surface p-6"><h2 className="mb-1 text-xl font-medium">Hosted pages aren’t available in this environment</h2><p className="text-muted">Page storage is not connected here.</p></div>;
  const { data, error } = await adm().from("pages").select(PAGE_COLS).eq("user_id", userId).neq("lifecycle", "deleted").order("updated_at", { ascending: false });
  if (error) {
    return isMissingTable(error)
      ? <div role="status" className="rounded-panel bg-surface p-6"><h2 className="mb-1 text-xl font-medium">Hosted pages are not available yet</h2><p className="text-muted">They’re being set up. Your static QR codes are unaffected.</p></div>
      : <div role="alert" className="rounded-panel bg-surface p-6"><h2 className="mb-1 text-xl font-medium">We couldn’t load your pages</h2><p className="text-muted">Try again in a moment. Nothing has been deleted.</p></div>;
  }
  const rows = (data ?? []) as PageRow[];
  return (
    <>
      {sp.deleted ? <p role="status" className="mb-4 rounded-control bg-soft p-3 text-sm text-brand">Card deleted.</p> : null}
      {caps.maxPages === 0 ? (
        <div className="mb-6 rounded-panel bg-surface p-6">
          <h2 className="mb-1 text-xl font-medium">Digital business cards need Pro or Business</h2>
          <p className="mb-4 text-muted">Your static QR codes keep working on every plan. Upgrade to create cards you can edit after printing.</p>
          <LinkButton href="/pricing">See plans</LinkButton>
        </div>
      ) : (
        <p className="mb-4 text-muted">{rows.length} of {caps.maxPages} hosted pages used on your {caps.name} plan.</p>
      )}
      {rows.length === 0 ? (
        caps.maxPages > 0 ? (
          <div className="rounded-panel bg-surface p-8"><h2 className="mb-2 text-xl font-medium">No pages yet</h2><p className="mb-4 text-muted">Create a digital business card with your photo, contact details and a Save contact button.</p><LinkButton href="/workspace/pages/new">Create a card</LinkButton></div>
        ) : null
      ) : (
        <ul className="m-0 list-none divide-y divide-divider rounded-panel bg-surface p-0">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <Link href={`/workspace/pages/${r.id}`} className="break-words text-lg font-medium text-brand">{r.title}</Link>
                <p className="text-sm text-muted">Digital business card · {r.taken_down_at ? "Disabled by Qrenuvi" : LIFE[r.lifecycle] ?? r.lifecycle} · edited {new Date(r.updated_at).toLocaleDateString("en-GB", { dateStyle: "medium" })}</p>
              </div>
              <LinkButton href={`/workspace/pages/${r.id}`} variant="secondary">{caps.maxPages > 0 ? "Edit" : "View"}</LinkButton>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function Pages(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <div className="mx-auto max-w-[1280px] px-5 py-8 sm:px-10 sm:py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-3 text-[28px] font-semibold leading-tight tracking-[-0.9px] sm:text-[40px]">Pages</h1>
          <p className="mb-6 text-lg text-muted">Hosted pages you can edit after printing. Static QR codes stay under My codes.</p>
        </div>
        <LinkButton href="/workspace/pages/new">New card</LinkButton>
      </div>
      <Suspense fallback={<p role="status" className="text-muted">Loading your pages…</p>}><List searchParams={props.searchParams} /></Suspense>
    </div>
  );
}
