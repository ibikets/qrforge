"use client";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { LuImage } from "react-icons/lu";
import { DIETARY_LABEL, STATUS_LABEL, formatPrice } from "@/lib/pages/items";
import type { PubBlock, PubItem } from "@/lib/pages/blocks";

type Items = Extract<PubBlock, { type: "items" }>;
const h2 = "mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--qc-accent)]";

function Status({ s }: { s: PubItem["status"] }) {
  if (s === "available") return null;
  const tone = s === "sold_out" ? "bg-[#f3e6e6] text-[#8a1c1c]" : "bg-[var(--qc-tint)] text-ink";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{STATUS_LABEL[s]}</span>;
}
const price = (i: PubItem, cur: string) => (i.price !== null ? formatPrice(i.price, cur) : "");

function Photo({ i, mediaBase, size }: { i: PubItem; mediaBase: string; size: number }) {
  if (!i.imageId) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`${mediaBase}/${i.imageId}?size=thumb`} alt={i.name} width={i.w || size} height={i.h || size} loading="lazy" decoding="async" className="aspect-square w-full rounded-control border border-[var(--qc-line)] object-cover" />;
}

/** Restaurant menu: category jump links, then dishes with photo, price, dietary labels and availability. Read-only; nothing can be ordered. */
function Menu({ b, mediaBase }: { b: Items; mediaBase: string }) {
  const uid = useId();
  return (
    <section aria-label={b.heading || "Menu"} className="mb-6">
      {b.heading ? <h2 className={h2}>{b.heading}</h2> : null}
      {b.categories.length > 1 ? (
        <nav aria-label="Menu categories" className="-mx-1 mb-4 flex flex-wrap gap-2">
          {b.categories.map((c) => <a key={c.id} href={`#${uid}-${c.id}`} className="inline-flex min-h-11 items-center rounded-full border border-[var(--qc-line)] px-4 text-sm text-ink no-underline hover:bg-[var(--qc-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--qc-accent)]">{c.name || "Menu"}</a>)}
        </nav>
      ) : null}
      {b.categories.map((c) => (
        <div key={c.id} className="mb-6">
          {c.name ? <h3 id={`${uid}-${c.id}`} className="mb-3 scroll-mt-4 border-b border-[var(--qc-line)] pb-1 text-lg font-medium">{c.name}</h3> : null}
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {c.items.map((i) => (
              <li key={i.id} className="flex gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="break-words text-base font-medium">{i.name}</p>
                    {price(i, b.currency) ? <p className="shrink-0 text-base font-medium">{price(i, b.currency)}</p> : null}
                  </div>
                  {i.description ? <p className="mt-0.5 whitespace-pre-line break-words text-sm text-muted">{i.description}</p> : null}
                  {i.tags.length || i.status !== "available" ? (
                    <p className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Status s={i.status} />
                      {i.tags.map((t) => <span key={t} className="rounded-full border border-[var(--qc-line)] px-2 py-0.5 text-xs">{DIETARY_LABEL[t]}</span>)}
                    </p>
                  ) : null}
                </div>
                {i.imageId ? <div className="w-24 shrink-0"><Photo i={i} mediaBase={mediaBase} size={96} /></div> : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="text-xs text-muted">Prices and availability can change. Ask the business to confirm. This page is a menu only: you cannot order or pay here.</p>
    </section>
  );
}

/** Product catalogue: search, category filter and a grid of products; each opens its own page (when a destination exists). */
function Catalogue({ b, mediaBase, itemBase }: { b: Items; mediaBase: string; itemBase: string | null }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const uid = useId();
  const needle = q.trim().toLowerCase();
  const view = useMemo(() => b.categories.filter((c) => !cat || c.id === cat).map((c) => ({ ...c, items: c.items.filter((i) => !needle || `${i.name} ${i.description}`.toLowerCase().includes(needle)) })).filter((c) => c.items.length), [b.categories, cat, needle]);
  const count = view.reduce((n, c) => n + c.items.length, 0);
  const all = b.categories.reduce((n, c) => n + c.items.length, 0);
  const chip = (on: boolean) => `inline-flex min-h-11 items-center rounded-full border px-4 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--qc-accent)] ${on ? "border-transparent bg-[var(--qc-accent)] text-white" : "border-[var(--qc-line)] bg-white text-ink hover:bg-[var(--qc-tint)]"}`;
  return (
    <section aria-label={b.heading || "Products"} className="mb-6">
      {b.heading ? <h2 className={h2}>{b.heading}</h2> : null}
      {all > 4 ? (
        <div className="mb-3">
          <label htmlFor={`${uid}-q`} className="mb-1 block text-sm font-medium">Search products</label>
          <input id={`${uid}-q`} type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={60} autoComplete="off" className="min-h-12 w-full rounded-control border border-control-border bg-white px-3 text-base" />
        </div>
      ) : null}
      {b.categories.length > 1 ? (
        <div role="group" aria-label="Filter by category" className="mb-4 flex flex-wrap gap-2">
          <button type="button" className={chip(!cat)} aria-pressed={!cat} onClick={() => setCat("")}>All</button>
          {b.categories.map((c) => <button key={c.id} type="button" className={chip(cat === c.id)} aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.name || "Other"}</button>)}
        </div>
      ) : null}
      <p role="status" aria-live="polite" className="mb-3 text-sm text-muted">{count === all ? `${all} product${all === 1 ? "" : "s"}` : `Showing ${count} of ${all} products`}</p>
      {count === 0 ? <p className="rounded-control border border-[var(--qc-line)] p-4 text-sm">No products match. Clear the search or choose another category.</p> : null}
      {view.map((c) => (
        <div key={c.id} className="mb-5">
          {c.name && b.categories.length > 1 ? <h3 className="mb-2 text-lg font-medium">{c.name}</h3> : null}
          <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0">
            {c.items.map((i) => {
              const body = (
                <>
                  {i.imageId ? <Photo i={i} mediaBase={mediaBase} size={200} /> : <div aria-hidden="true" className="flex aspect-square w-full items-center justify-center rounded-control bg-[var(--qc-tint)] text-ink"><LuImage size={28} /></div>}
                  <p className="mt-2 break-words text-sm font-medium">{i.name}</p>
                  {price(i, b.currency) ? <p className="text-sm">{price(i, b.currency)}</p> : null}
                  <p className="mt-1"><Status s={i.status} /></p>
                </>
              );
              return (
                <li key={i.id}>
                  {itemBase ? <Link href={`${itemBase}/${i.id}`} className="block rounded-control text-ink no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--qc-accent)]" aria-label={`${i.name}${price(i, b.currency) ? `, ${price(i, b.currency)}` : ""}${i.status !== "available" ? `, ${STATUS_LABEL[i.status]}` : ""}. Open product page`}>{body}</Link> : <div>{body}</div>}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <p className="text-xs text-muted">Open a product to ask about it on WhatsApp or by email. There is no online checkout: you arrange payment and delivery with the seller.</p>
    </section>
  );
}

export default function ItemsView({ b, kind, mediaBase, itemBase }: { b: Items; kind: "menu" | "product"; mediaBase: string; itemBase: string | null }) {
  return kind === "menu" ? <Menu b={b} mediaBase={mediaBase} /> : <Catalogue b={b} mediaBase={mediaBase} itemBase={itemBase} />;
}
