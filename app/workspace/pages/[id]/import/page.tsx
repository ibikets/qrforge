import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import ImportWizard from "@/components/import/ImportWizard";
import { LinkButton } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { adm } from "@/lib/admin/db";
import { isImportKind, itemsBlock } from "@/lib/import/server";
import { normaliseContent, type PageContent } from "@/lib/pages/blocks";
import { ownedPage } from "@/lib/pages/server";
import { PLANS } from "@/lib/plans";
import { getSession, supabaseConfigured } from "@/lib/supabase";

export const metadata: Metadata = { title: "Import items", robots: { index: false } };

async function Body({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, plan } = await getSession();
  if (!userId) redirect(`/login?next=/workspace/pages/${id}/import`);
  if (!supabaseConfigured || !process.env.SUPABASE_SERVICE_ROLE_KEY) notFound();
  const page = await ownedPage(id, userId);
  if (!page) notFound();
  if (!isImportKind(page.kind)) return <Notice tone="info">Import is available for menus and catalogues.</Notice>;
  if (PLANS[plan].maxImportRows === 0) return <Notice tone="warning">Importing items is included with Pro and Business. Choose a plan to import from a spreadsheet.</Notice>;
  if (page.lifecycle === "archived") return <Notice tone="warning">Archived pages are read-only.</Notice>;
  const blk = itemsBlock(normaliseContent(page.kind, page.draft) as PageContent);
  const jobs = await adm().from("import_jobs").select("id,source_name,counts,created_at,status,after_version").eq("page_id", page.id).eq("user_id", userId).not("after_version", "is", null).order("created_at", { ascending: false }).limit(5);
  return (
    <ImportWizard pageId={page.id} kind={page.kind} currency={blk?.currency ?? "NGN"} categories={blk?.categories ?? []} version={page.draft_version} maxRows={PLANS[plan].maxImportRows}
      history={jobs.error ? [] : ((jobs.data ?? []) as never[])} draftVersionNow={page.draft_version} onPageHref={`/workspace/pages/${page.id}`} />
  );
}

export default function ImportPage(props: { params: Promise<{ id: string }> }) {
  return (
    <div className="mx-auto max-w-[1280px] px-5 py-8 sm:px-10 sm:py-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-2 text-[28px] font-semibold leading-tight tracking-[-0.9px] sm:text-[40px]">Import items</h1>
          <p className="text-lg text-muted">Bring in many items at once. Choose a file, match the columns, review, then import into your draft.</p>
        </div>
        <Suspense fallback={null}><BackLink params={props.params} /></Suspense>
      </div>
      <Suspense fallback={<p role="status" className="text-muted">Loading…</p>}><Body params={props.params} /></Suspense>
    </div>
  );
}
async function BackLink({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <LinkButton href={`/workspace/pages/${id}`} variant="secondary">Back to editor</LinkButton>; }
