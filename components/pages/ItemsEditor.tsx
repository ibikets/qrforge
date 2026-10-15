"use client";
import UploadField from "@/components/pages/UploadField";
import { Button } from "@/components/ui/Button";
import { TextField, controlClass } from "@/components/ui/Field";
import { MAX_CATEGORIES, MAX_ITEMS, MAX_ITEMS_PER_CATEGORY, emptyItem, type BlockErrors, type CatItem, type Category, type PageContent } from "@/lib/pages/blocks";
import { CURRENCIES, DIETARY, DIETARY_LABEL, MENU_STATUSES, STATUSES, STATUS_LABEL, type Currency, type Dietary, type ItemStatus } from "@/lib/pages/items";
import { newRowId } from "@/lib/pages/card";

type Block = Extract<PageContent["blocks"][number], { type: "items" }>;
const move = <T,>(l: T[], i: number, d: number) => { const j = i + d; if (j < 0 || j >= l.length) return l; const n = l.slice(); [n[i], n[j]] = [n[j], n[i]]; return n; };

/** Editor for the "priced items" section: categories of dishes (menu) or products (catalogue), each with an optional photo. */
export default function ItemsEditor({ b, kind, pageId, ro, errors, clearErr, patch, focusSoon }: {
  b: Block; kind: "menu" | "product"; pageId: string; ro: boolean; errors: BlockErrors;
  clearErr: (k: string) => void; patch: (change: Partial<Block>) => void; focusSoon: (id: string) => void;
}) {
  const menu = kind === "menu";
  const noun = menu ? "dish" : "product";
  const total = b.categories.reduce((n, c) => n + c.items.length, 0);
  const photos = b.categories.reduce((n, c) => n + c.items.filter((i) => i.imageId).length, 0);
  const setCats = (categories: Category[]) => patch({ categories });
  const setCat = (ci: number, c: Partial<Category>) => setCats(b.categories.map((x, n) => (n === ci ? { ...x, ...c } : x)));
  const setItem = (ci: number, ii: number, c: Partial<CatItem>) => setCat(ci, { items: b.categories[ci].items.map((x, n) => (n === ii ? { ...x, ...c } : x)) });
  const statuses: ItemStatus[] = menu ? MENU_STATUSES : STATUSES;
  const sel = `${controlClass} bg-surface`;
  return (
    <>
      <div className="mb-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
        <TextField id={`${b.id}-heading`} label={menu ? "Menu heading (optional)" : "Catalogue heading (optional)"} value={b.heading} maxLength={60} onChange={(e) => patch({ heading: e.target.value })} />
        <div className="mb-4">
          <label htmlFor={`${b.id}-cur`} className="mb-2 block text-sm font-medium">Currency</label>
          <select id={`${b.id}-cur`} className={sel} value={b.currency} onChange={(e) => patch({ currency: e.target.value as Currency })}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <p className="mb-3 text-[13px] text-muted">{total} of {MAX_ITEMS} {noun}s · {photos} photo{photos === 1 ? "" : "s"}. Each page can hold up to 60 uploaded files in total. Prices are shown exactly as you enter them; leave a price empty to show none.</p>
      {b.categories.map((cat, ci) => {
        const ck = `${b.id}.cat.${cat.id}`;
        return (
          <fieldset key={cat.id} className="mb-4 min-w-0 rounded-panel border border-divider p-3">
            <legend className="px-1 text-sm font-medium">Category {ci + 1}</legend>
            <input id={`${b.id}-cat-${ci}`} aria-label={`Category ${ci + 1} name`} aria-invalid={errors[ck] ? true : undefined} className={controlClass} placeholder={menu ? "e.g. Starters, Mains, Drinks" : "e.g. Dresses, Accessories"} maxLength={60} value={cat.name}
              onChange={(e) => { clearErr(ck); setCat(ci, { name: e.target.value }); }} />
            {errors[ck] ? <p role="alert" className="mt-1 text-[13px] text-danger">{errors[ck]}</p> : null}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="ghost" id={`mc-${cat.id}-up`} disabled={ci === 0} aria-label={`Move category ${ci + 1} up`} onClick={() => { setCats(move(b.categories, ci, -1)); focusSoon(`mc-${cat.id}-up`); }}>Move category up</Button>
              <Button variant="ghost" id={`mc-${cat.id}-down`} disabled={ci === b.categories.length - 1} aria-label={`Move category ${ci + 1} down`} onClick={() => { setCats(move(b.categories, ci, 1)); focusSoon(`mc-${cat.id}-down`); }}>Move category down</Button>
              <Button variant="ghost" className="ml-auto !text-danger" aria-label={`Remove category ${ci + 1} and its ${noun}s`} onClick={() => { setCats(b.categories.filter((_, n) => n !== ci)); focusSoon(`${b.id}-add-cat`); }}>Remove category</Button>
            </div>

            {cat.items.map((it, ii) => {
              const k = `${b.id}.items.${it.id}`;
              const label = `${noun[0].toUpperCase()}${noun.slice(1)} ${ii + 1} in category ${ci + 1}`;
              const upd = (c: Partial<CatItem>) => { clearErr(k); setItem(ci, ii, c); };
              return (
                <div key={it.id} className="mt-3 rounded-control border border-divider p-3">
                  <p className="mb-2 text-sm font-medium">{noun[0].toUpperCase() + noun.slice(1)} {ii + 1}</p>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem]">
                    <input id={`${b.id}-it-${it.id}`} aria-label={`${label} name`} aria-invalid={errors[k] ? true : undefined} className={controlClass} placeholder="Name" maxLength={80} value={it.name} onChange={(e) => upd({ name: e.target.value })} />
                    <input aria-label={`${label} price in ${b.currency}`} inputMode="decimal" className={controlClass} placeholder={`Price (${b.currency})`} maxLength={14} value={it.price} onChange={(e) => upd({ price: e.target.value })} />
                  </div>
                  <textarea aria-label={`${label} description (optional)`} rows={2} className={`${controlClass} mt-2`} placeholder="Description (optional)" maxLength={400} value={it.description} onChange={(e) => upd({ description: e.target.value })} />
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div>
                      <label htmlFor={`${b.id}-st-${it.id}`} className="mb-1 block text-sm">Availability</label>
                      <select id={`${b.id}-st-${it.id}`} className={sel} value={it.status} onChange={(e) => upd({ status: e.target.value as ItemStatus })}>
                        {statuses.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                      </select>
                    </div>
                    {b.categories.length > 1 ? (
                      <div>
                        <label htmlFor={`${b.id}-mv-${it.id}`} className="mb-1 block text-sm">Category</label>
                        <select id={`${b.id}-mv-${it.id}`} className={sel} value={cat.id} onChange={(e) => {
                          const to = b.categories.findIndex((x) => x.id === e.target.value);
                          if (to < 0 || to === ci || b.categories[to].items.length >= MAX_ITEMS_PER_CATEGORY) return;
                          setCats(b.categories.map((x, n) => (n === ci ? { ...x, items: x.items.filter((_, m) => m !== ii) } : n === to ? { ...x, items: [...x.items, it] } : x)));
                        }}>
                          {b.categories.map((x, n) => <option key={x.id} value={x.id}>{x.name || `Category ${n + 1}`}</option>)}
                        </select>
                      </div>
                    ) : null}
                  </div>
                  {menu ? (
                    <fieldset className="mt-2 min-w-0 border-0 p-0">
                      <legend className="mb-1 text-sm">Dietary information (optional)</legend>
                      <div className="flex flex-wrap gap-x-4">
                        {DIETARY.map((d: Dietary) => (
                          <label key={d} className="inline-flex min-h-12 items-center gap-2 text-sm">
                            <input type="checkbox" className="size-5" checked={it.tags.includes(d)} onChange={(e) => upd({ tags: e.target.checked ? [...it.tags, d] : it.tags.filter((x) => x !== d) })} /> {DIETARY_LABEL[d]}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {it.imageId ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/pages/${pageId}/media/${it.imageId}?size=thumb`} alt={`Photo of ${it.name || noun}`} width={64} height={64} className="size-16 rounded-control border border-divider object-cover" />
                    ) : null}
                    <UploadField id={`${b.id}-ph-${it.id}`} pageId={pageId} kind="image" disabled={ro} hasFile={!!it.imageId} label="Add photo" replaceLabel="Replace photo" removeLabel="Remove photo"
                      describe="PNG, JPEG or WebP, up to 5 MB. Location and camera details are removed." onRemove={() => upd({ imageId: null, meta: null })}
                      onDone={(u) => upd({ imageId: u.id, meta: { w: u.width ?? 1, h: u.height ?? 1 } })} />
                  </div>
                  {errors[k] ? <p role="alert" className="mt-2 text-[13px] text-danger">{errors[k]}</p> : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button variant="ghost" id={`mi-${it.id}-up`} disabled={ii === 0} aria-label={`Move ${label} up`} onClick={() => { setCat(ci, { items: move(cat.items, ii, -1) }); focusSoon(`mi-${it.id}-up`); }}>Move up</Button>
                    <Button variant="ghost" id={`mi-${it.id}-down`} disabled={ii === cat.items.length - 1} aria-label={`Move ${label} down`} onClick={() => { setCat(ci, { items: move(cat.items, ii, 1) }); focusSoon(`mi-${it.id}-down`); }}>Move down</Button>
                    <Button variant="ghost" className="ml-auto" aria-label={`Remove ${label}`} onClick={() => { setCat(ci, { items: cat.items.filter((_, n) => n !== ii) }); focusSoon(`${b.id}-addit-${cat.id}`); }}>Remove</Button>
                  </div>
                </div>
              );
            })}
            <Button id={`${b.id}-addit-${cat.id}`} className="mt-3" variant="secondary" disabled={cat.items.length >= MAX_ITEMS_PER_CATEGORY || total >= MAX_ITEMS}
              onClick={() => { const n = emptyItem(); setCat(ci, { items: [...cat.items, n] }); focusSoon(`${b.id}-it-${n.id}`); }}>Add {noun} to category {ci + 1}</Button>
          </fieldset>
        );
      })}
      <Button id={`${b.id}-add-cat`} variant="secondary" disabled={b.categories.length >= MAX_CATEGORIES} onClick={() => { const c: Category = { id: newRowId(), name: "", items: [emptyItem()] }; setCats([...b.categories, c]); focusSoon(`${b.id}-cat-${b.categories.length}`); }}>Add category</Button>
      {b.categories.length >= MAX_CATEGORIES ? <p className="mt-1 text-[13px] text-muted">You can add up to {MAX_CATEGORIES} categories.</p> : null}
    </>
  );
}
