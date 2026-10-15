import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";
import { Suspense } from "react";
import type { Metadata } from "next";
import BlocksView from "@/components/pages/BlocksView";
import CardView from "@/components/pages/CardView";
import { readSnapshot } from "@/lib/pages/card";
import { orgVcf, readPageSnapshot } from "@/lib/pages/blocks";
import { PUBLIC_ID, loadPublic, pageTag } from "@/lib/pages/server";

// Recipient pages are private-by-default for search engines: people receive the link or scan a code.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer", title: "Shared page" };

async function getPublic(publicId: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag(pageTag(publicId));
  return loadPublic(publicId);
}

function Unavailable({ configured = true }: { configured?: boolean }) {
  return (
    <div role="status" className="mx-auto max-w-[440px] rounded-panel bg-surface p-8 text-center">
      <h1 className="mb-2 text-2xl font-medium">{configured ? "This page isn’t available" : "Hosted pages aren’t available here"}</h1>
      <p className="text-muted">{configured ? "The link may be wrong, or the page may have been taken offline by its owner. Check the address or ask the person who shared it." : "This environment has no page storage connected."}</p>
    </div>
  );
}

async function Card({ params }: { params: Promise<{ publicId: string }> }) {
  // Render per request: the page itself is never stored as static output, so unpublish and takedown take effect at once.
  // Only the database read below is cached, and it is expired explicitly (refreshPage) on every change.
  await connection();
  const { publicId } = await params;
  if (!PUBLIC_ID.test(publicId)) return <Unavailable />;
  const r = await getPublic(publicId);
  if (r.state === "unconfigured") return <Unavailable configured={false} />;
  if (r.state !== "ok") return <Unavailable />;
  if (r.kind !== "card") {
    const page = readPageSnapshot(r.snapshot);
    if (!page) return <Unavailable />;
    return <BlocksView s={page} mediaBase={`/p/${publicId}/media`} fileBase={`/p/${publicId}/file`} vcfHref={orgVcf(page) ? `/p/${publicId}/contact.vcf` : null} itemBase={`/p/${publicId}/item`} />;
  }
  const snap = readSnapshot(r.snapshot);
  if (!snap) return <Unavailable />;
  return <CardView s={snap} mediaBase={`/p/${publicId}/media`} vcfHref={`/p/${publicId}/contact.vcf`} />;
}

export default function PublicCard(props: { params: Promise<{ publicId: string }> }) {
  return (
    <div className="px-4 py-8 sm:py-12">
      <Suspense fallback={<p role="status" className="text-center text-muted">Loading…</p>}>
        <Card params={props.params} />
      </Suspense>
    </div>
  );
}
