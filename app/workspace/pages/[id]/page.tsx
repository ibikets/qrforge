import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import QRCode from "qrcode";
import { headers } from "next/headers";
import BlocksEditor from "@/components/pages/BlocksEditor";
import CardEditor from "@/components/pages/CardEditor";
import { LinkButton } from "@/components/ui/Button";
import { adm } from "@/lib/admin/db";
import { normaliseCard } from "@/lib/pages/card";
import { normaliseContent, isBlockKind } from "@/lib/pages/blocks";
import { ownedPage } from "@/lib/pages/server";
import { PLANS } from "@/lib/plans";
import { getSession, supabaseConfigured } from "@/lib/supabase";

export const metadata: Metadata = { title: "Edit page", robots: { index: false } };

async function Editor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, plan } = await getSession();
  if (!userId) redirect(`/login?next=/workspace/pages/${id}`);
  if (!supabaseConfigured || !process.env.SUPABASE_SERVICE_ROLE_KEY) notFound();
  const page = await ownedPage(id, userId);
  if (!page) notFound();
  const { data: revs } = await adm().from("page_revisions").select("version,published_at").eq("page_id", page.id).order("version", { ascending: false }).limit(20);
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const origin = process.env.VERCEL_ENV === "preview" || !process.env.NEXT_PUBLIC_SITE_URL ? `${proto}://${host}` : process.env.NEXT_PUBLIC_SITE_URL;
  const publicUrl = `${origin}/p/${page.public_id}`;
  const qrSvg = await QRCode.toString(publicUrl, { type: "svg", errorCorrectionLevel: "M", margin: 2 });
  if (isBlockKind(page.kind))
    return (
      <BlocksEditor
        key={page.id} id={page.id} initialTitle={page.title} initialContent={normaliseContent(page.kind, page.draft)} version={page.draft_version}
        lifecycle={page.lifecycle} publishedVersion={page.published_version} publicUrl={publicUrl}
        revisions={(revs ?? []) as { version: number; published_at: string }[]} canEdit={PLANS[plan].maxPages > 0}
        takenDown={!!page.taken_down_at} qrSvg={qrSvg}
      />
    );
  return (
    <CardEditor
      id={page.id} initialTitle={page.title} initialCard={normaliseCard(page.draft)} version={page.draft_version}
      lifecycle={page.lifecycle} publishedVersion={page.published_version} publicUrl={publicUrl}
      revisions={(revs ?? []) as { version: number; published_at: string }[]} canEdit={PLANS[plan].maxPages > 0}
      takenDown={!!page.taken_down_at} qrSvg={qrSvg}
    />
  );
}

export default function EditCard(props: { params: Promise<{ id: string }> }) {
  return (
    <div className="mx-auto max-w-[1280px] px-5 py-8 sm:px-10 sm:py-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-2 text-[28px] font-semibold leading-tight tracking-[-0.9px] sm:text-[40px]">Edit page</h1>
          <p className="text-lg text-muted">Edit, preview and publish. Changes go live only when you publish.</p>
        </div>
        <LinkButton href="/workspace/pages" variant="secondary">All pages</LinkButton>
      </div>
      <Suspense fallback={<p role="status" className="text-muted">Loading your page…</p>}>
        <Editor params={props.params} />
      </Suspense>
    </div>
  );
}
