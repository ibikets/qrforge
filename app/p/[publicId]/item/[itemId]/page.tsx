import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { LuArrowLeft, LuMail, LuMessageCircle } from "react-icons/lu";
import { cardVars } from "@/components/pages/card-theme";
import { ACCENTS } from "@/lib/pages/card";
import { readPageSnapshot } from "@/lib/pages/blocks";
import { DIETARY_LABEL, STATUS_LABEL, enquiryLinks, formatPrice } from "@/lib/pages/items";
import { PUBLIC_ID, loadPublic, pageTag } from "@/lib/pages/server";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer", title: "Product" };

async function getPublic(publicId: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag(pageTag(publicId));
  return loadPublic(publicId);
}

function Unavailable() {
  return (
    <div role="status" className="mx-auto max-w-[440px] rounded-panel bg-surface p-8 text-center">
      <h1 className="mb-2 text-2xl font-medium">This product isn’t available</h1>
      <p className="text-muted">The link may be wrong, or the product may have been removed. Check the address or ask the person who shared it.</p>
    </div>
  );
}

const act = "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control px-4 py-3 text-base font-medium no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--qc-accent)]";

async function Product({ params }: { params: Promise<{ publicId: string; itemId: string }> }) {
  await connection();
  const { publicId, itemId } = await params;
  if (!PUBLIC_ID.test(publicId) || !/^[a-z0-9_-]{1,24}$/i.test(itemId)) return <Unavailable />;
  const r = await getPublic(publicId);
  if (r.state !== "ok" || r.kind !== "product") return <Unavailable />;
  const s = readPageSnapshot(r.snapshot);
  if (!s) return <Unavailable />;
  const cat = s.blocks.find((b) => b.type === "items");
  const item = cat?.type === "items" ? cat.categories.flatMap((c) => c.items).find((i) => i.id === itemId) : null;
  const head = s.blocks.find((b) => b.type === "header");
  if (!cat || cat.type !== "items" || !item || head?.type !== "header") return <Unavailable />;
  const accent = ACCENTS.find((a) => a.id === s.accent) ?? ACCENTS[0];
  const category = cat.categories.find((c) => c.items.some((i) => i.id === itemId));
  const links = enquiryLinks(cat.enquiry, item, cat.currency, head.name);
  const price = item.price !== null ? formatPrice(item.price, cat.currency) : null;
  return (
    <article aria-label={item.name} style={cardVars(accent)} className="qcard mx-auto w-full max-w-[440px] overflow-hidden rounded-panel bg-surface shadow-[0_1px_3px_rgba(0,0,0,.08)]">
      {item.imageId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/p/${publicId}/media/${item.imageId}`} alt={item.name} width={item.w || 440} height={item.h || 440} className="aspect-square w-full object-cover" />
      ) : null}
      <div className="p-5">
        <Link href={`/p/${publicId}`} className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm text-[var(--qc-accent)] no-underline focus-visible:outline-2 focus-visible:outline-offset-2"><LuArrowLeft aria-hidden="true" size={18} /> All products from {head.name}</Link>
        {category?.name ? <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--qc-accent)]">{category.name}</p> : null}
        <h1 className="mb-1 break-words text-2xl font-medium">{item.name}</h1>
        {price ? <p className="mb-2 text-xl">{price}</p> : null}
        <p className="mb-3"><span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${item.status === "sold_out" ? "bg-[#f3e6e6] text-[#8a1c1c]" : "bg-[var(--qc-tint)] text-ink"}`}>{STATUS_LABEL[item.status]}</span>
          {item.tags.map((t) => <span key={t} className="ml-1.5 rounded-full border border-[var(--qc-line)] px-2 py-0.5 text-xs">{DIETARY_LABEL[t]}</span>)}</p>
        {item.description ? <p className="mb-5 whitespace-pre-line break-words text-base">{item.description}</p> : null}
        {item.status === "sold_out" ? <p className="mb-3 text-sm text-muted">This product is marked sold out. You can still ask the seller when it will be available.</p> : null}
        <div className="flex flex-col gap-2">
          {links.whatsapp ? <a className={`${act} !bg-[#0e7a3f] !text-white hover:brightness-110`} href={links.whatsapp} rel="noopener noreferrer" target="_blank"><LuMessageCircle aria-hidden="true" size={20} /> Ask about this on WhatsApp</a> : null}
          {links.email ? <a className={`${act} border border-[var(--qc-line)] bg-white text-ink hover:bg-[var(--qc-tint)]`} href={links.email}><LuMail aria-hidden="true" size={20} /> Ask about this by email</a> : null}
        </div>
        <p className="mt-4 text-xs text-muted">Asking opens your own WhatsApp or email app with a message about this product. Payment and delivery are arranged directly with the seller; nothing is bought on this page.</p>
      </div>
    </article>
  );
}

export default function ProductPage(props: { params: Promise<{ publicId: string; itemId: string }> }) {
  return (
    <div className="px-4 py-8 sm:py-12">
      <Suspense fallback={<p role="status" className="text-center text-muted">Loading…</p>}><Product params={props.params} /></Suspense>
    </div>
  );
}
