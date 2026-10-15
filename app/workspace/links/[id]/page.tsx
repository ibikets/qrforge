import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import QRCode from "qrcode";
import LinkEditor from "@/components/links/LinkEditor";
import LinkStats from "@/components/links/LinkStats";
import { LinkButton } from "@/components/ui/Button";
import { loadStats, ownedLink } from "@/lib/links-server";
import { PLANS } from "@/lib/plans";
import { getSession, supabaseConfigured } from "@/lib/supabase";

export const metadata: Metadata = { title: "Edit dynamic link", robots: { index: false } };

async function Editor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, plan } = await getSession();
  if (!userId) redirect(`/login?next=/workspace/links/${id}`);
  if (!supabaseConfigured || !process.env.SUPABASE_SERVICE_ROLE_KEY) notFound();
  const link = await ownedLink(id, userId);
  if (!link) notFound();
  const stats = await loadStats(link.id);
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const origin = process.env.VERCEL_ENV === "preview" || !process.env.NEXT_PUBLIC_SITE_URL ? `${proto}://${host}` : process.env.NEXT_PUBLIC_SITE_URL;
  const address = `${origin}/l/${link.slug}`;
  const qrSvg = await QRCode.toString(address, { type: "svg", errorCorrectionLevel: "M", margin: 2 });
  return (
    <>
      <LinkEditor key={link.id} id={link.id} initialName={link.name} initialDestination={link.destination} initialRules={link.rules ?? {}} version={link.version} state={link.state} address={address} qrSvg={qrSvg} takenDown={!!link.taken_down_at} canEdit={PLANS[plan].maxLinks > 0} />
      <LinkStats s={stats} />
    </>
  );
}

export default function EditLink(props: { params: Promise<{ id: string }> }) {
  return (
    <div className="mx-auto max-w-[1280px] px-5 py-8 sm:px-10 sm:py-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-2 text-[28px] font-semibold leading-tight tracking-[-0.9px] sm:text-[40px]">Edit dynamic link</h1>
          <p className="text-lg text-muted">Changes go live the moment you save.</p>
        </div>
        <LinkButton href="/workspace/links" variant="secondary">All links</LinkButton>
      </div>
      <Suspense fallback={<p role="status" className="text-muted">Loading…</p>}><Editor params={props.params} /></Suspense>
    </div>
  );
}
