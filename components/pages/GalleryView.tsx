"use client";
import { useEffect, useRef, useState } from "react";
import { LuChevronLeft, LuChevronRight, LuX } from "react-icons/lu";
import type { PubImage } from "@/lib/pages/blocks";

/** Image grid (thumbnails) with an accessible full-size view: native dialog, Escape, arrow keys and Previous/Next buttons; focus returns to the thumbnail. */
export default function GalleryView({ items, mediaBase, heading }: { items: PubImage[]; mediaBase: string; heading?: string }) {
  const [at, setAt] = useState<number | null>(null);
  const dlg = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const n = items.length;
  useEffect(() => { const d = dlg.current; if (!d) return; if (at !== null && !d.open) d.showModal(); if (at === null && d.open) d.close(); }, [at]);
  const close = () => { setAt(null); opener.current?.focus(); };
  const step = (d: number) => setAt((i) => (i === null ? i : (i + d + n) % n));
  const cur = at !== null ? items[at] : null;
  const btn = "inline-flex size-12 items-center justify-center rounded-full bg-white/90 text-ink hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2";
  return (
    <section aria-label={heading || "Images"} className="mb-6">
      {heading ? <h2 className="mb-2 text-sm font-medium text-muted">{heading}</h2> : null}
      <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0">
        {items.map((it, i) => (
          <li key={it.id}>
            <button type="button" className="block w-full overflow-hidden rounded-control border border-divider bg-soft p-0 focus-visible:outline-2 focus-visible:outline-offset-2"
              aria-label={`Open image ${i + 1} of ${n}: ${it.alt}`} onClick={(e) => { opener.current = e.currentTarget; setAt(i); }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${mediaBase}/${it.imageId}?size=thumb`} alt={it.alt} width={it.w} height={it.h} loading="lazy" decoding="async" className="aspect-square w-full object-cover" />
            </button>
            {it.caption ? <p className="mt-1 break-words text-sm text-muted">{it.caption}</p> : null}
          </li>
        ))}
      </ul>
      <dialog ref={dlg} aria-label={cur ? `Image ${at! + 1} of ${n}` : "Image"} onClose={() => { setAt(null); opener.current?.focus(); }}
        onKeyDown={(e) => { if (e.key === "ArrowRight") { e.preventDefault(); step(1); } else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); } }}
        className="m-auto max-h-[100dvh] w-full max-w-[min(100vw,900px)] border-0 bg-transparent p-3 backdrop:bg-black/80">
        {cur ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${mediaBase}/${cur.imageId}`} alt={cur.alt} className="mx-auto max-h-[78dvh] w-auto max-w-full rounded-control bg-white object-contain" />
            {cur.caption ? <p className="mt-2 rounded-control bg-white/90 p-2 text-center text-sm text-ink">{cur.caption}</p> : null}
            <div className="mt-3 flex items-center justify-between">
              <button type="button" className={btn} onClick={() => step(-1)} aria-label="Previous image" disabled={n < 2}><LuChevronLeft aria-hidden="true" size={22} /></button>
              <span className="rounded-control bg-white/90 px-3 py-1 text-sm" aria-live="polite">{at! + 1} / {n}</span>
              <button type="button" className={btn} onClick={() => step(1)} aria-label="Next image" disabled={n < 2}><LuChevronRight aria-hidden="true" size={22} /></button>
            </div>
            <button type="button" className={`${btn} absolute right-2 top-2`} onClick={close} aria-label="Close image" autoFocus><LuX aria-hidden="true" size={22} /></button>
          </div>
        ) : null}
      </dialog>
    </section>
  );
}
