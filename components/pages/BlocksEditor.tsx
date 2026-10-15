"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import BlocksView from "@/components/pages/BlocksView";
import LogoField from "@/components/pages/LogoField";
import PhotoField from "@/components/pages/PhotoField";
import PreviewBoundary from "@/components/pages/PreviewBoundary";
import { Button } from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import { TextArea, TextField, controlClass } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import {
  DAY_NAMES, KIND_INFO, MAX_ACTION_ROWS, MAX_LINKS, MAX_SOCIALS, emptyBlock, snapshotOfContent, validateContent, validTimeZone,
  type Block, type BlockErrors, type BlockType, type PageContent,
} from "@/lib/pages/blocks";
import { ACCENTS, newRowId, rowProblem, websiteUrl, type CardRow, type RowGroup } from "@/lib/pages/card";
const validUrl = (v: string) => websiteUrl(v) !== null;
import { GROUPS } from "@/lib/qr-contact";

type Rev = { version: number; published_at: string };
type Props = {
  id: string; initialTitle: string; initialContent: PageContent; version: number; lifecycle: string; publishedVersion: number | null;
  publicUrl: string; revisions: Rev[]; canEdit: boolean; takenDown: boolean; qrSvg: string;
};
const LIFE: Record<string, string> = { draft: "Draft, not published", published: "Published", unpublished: "Unpublished", archived: "Archived" };
const NAMES: Record<Exclude<BlockType, "header">, string> = { text: "Text", actions: "Contact buttons", links: "Link list", socials: "Social profiles", hours: "Opening hours", location: "Location", button: "Button" };
const ROWS: Record<RowGroup, { title: string; singular: string; placeholder: string; inputMode: "tel" | "email" | "url" | "text"; labels: { id: string; label: string }[] }> = {
  phones: { title: "Phone numbers", singular: "phone number", placeholder: "+234 800 000 0000", inputMode: "tel", labels: GROUPS.phone.types },
  emails: { title: "Email addresses", singular: "email address", placeholder: "name@example.com", inputMode: "email", labels: GROUPS.email.types },
  websites: { title: "Websites", singular: "website", placeholder: "example.com", inputMode: "url", labels: [] },
  socials: { title: "Social profiles", singular: "social profile", placeholder: "handle or https:// address", inputMode: "text", labels: GROUPS.social.types },
};
const move = <T,>(l: T[], i: number, d: number) => { const j = i + d; if (j < 0 || j >= l.length) return l; const n = l.slice(); [n[i], n[j]] = [n[j], n[i]]; return n; };

export default function BlocksEditor(p: Props) {
  const router = useRouter();
  const info = KIND_INFO[p.initialContent.kind];
  const [title, setTitle] = useState(p.initialTitle);
  const [content, setContent] = useState<PageContent>(p.initialContent);
  const [version, setVersion] = useState(p.version);
  const [life, setLife] = useState(p.lifecycle);
  const [pubVer, setPubVer] = useState(p.publishedVersion);
  const [saved, setSaved] = useState(() => JSON.stringify([p.initialTitle, p.initialContent]));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"" | "save" | "publish" | "unpublish" | "delete" | "restore">("");
  const [errors, setErrors] = useState<BlockErrors>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [conflict, setConflict] = useState<{ version: number; title: string; card: PageContent } | null>(null);
  const [dlg, setDlg] = useState<"" | "publish" | "unpublish" | "delete">("");
  const ro = !p.canEdit || life === "archived" || p.takenDown;
  const live = life === "published";
  const header = content.blocks[0].type === "header" ? content.blocks[0] : null;

  function edit(next: PageContent, t = title) {
    setContent(next); setTitle(t);
    setDirty(JSON.stringify([t, next]) !== saved);
    setMsg(null);
  }
  const clearErr = (k: string) => { if (errors[k]) setErrors((x) => { const n = { ...x }; delete n[k]; return n; }); };
  const patch = (id: string, change: Partial<Block>, errKey?: string) => {
    if (errKey) clearErr(errKey);
    edit({ ...content, blocks: content.blocks.map((b) => (b.id === id ? ({ ...b, ...change } as Block) : b)) });
  };
  const touch = (k: string) => setTouched((t) => new Set(t).add(k));
  const liveErrors = useMemo(() => validateContent(content, false), [content]);
  const problem = (k: string, own: () => string | null) => errors[k] ?? (touched.has(k) ? (liveErrors[k] ?? own()) : null);
  const focusSoon = (id: string) => setTimeout(() => document.getElementById(id)?.focus(), 0);

  const counts = content.blocks.reduce<Record<string, number>>((m, b) => ({ ...m, [b.type]: (m[b.type] ?? 0) + 1 }), {});
  const addable = info.allow.filter((t) => (counts[t] ?? 0) < (info.max[t] ?? 1));
  const [toAdd, setToAdd] = useState("");
  function addSection() {
    const t = (toAdd || addable[0]) as Exclude<BlockType, "header"> | undefined;
    if (!t) return;
    const b = emptyBlock(t);
    edit({ ...content, blocks: [...content.blocks, b] });
    setToAdd("");
    focusSoon(`sec-${b.id}`);
  }
  const moveBlock = (i: number, d: number) => {
    const rest = content.blocks.slice(1);
    const moved = move(rest, i - 1, d);
    edit({ ...content, blocks: [content.blocks[0], ...moved] });
    focusSoon(`mv-${content.blocks[i].id}-${d < 0 ? "up" : "down"}`);
  };
  const removeBlock = (i: number) => { const id = content.blocks[i - 1]?.id; edit({ ...content, blocks: content.blocks.filter((_, n) => n !== i) }); focusSoon("add-section"); void id; };

  async function call(path: string, method: string, body?: unknown) {
    try {
      const r = await fetch(path, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      return { ok: r.ok, status: r.status, j: await r.json().catch(() => ({})) };
    } catch {
      return { ok: false, status: 0, j: { error: "We couldn’t reach Qrenuvi. Your changes are still on this screen. Check your connection and try again." } };
    }
  }
  const focusError = () => setTimeout(() => document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus(), 0);
  async function save(): Promise<boolean> {
    setBusy("save"); setMsg(null);
    const r = await call(`/api/pages/${p.id}`, "PUT", { title, content, expectedVersion: version });
    setBusy("");
    if (r.ok) { setVersion(r.j.version); setSaved(JSON.stringify([title, content])); setDirty(false); setErrors({}); setMsg({ tone: "ok", text: "Draft saved." }); return true; }
    if (r.status === 409 && r.j.code === "conflict") { setConflict(r.j.current); return false; }
    if (r.j.errors) setErrors(r.j.errors);
    setMsg({ tone: "error", text: r.j.error ?? "We couldn’t save." });
    if (r.j.errors) focusError();
    return false;
  }
  async function publish() {
    setDlg("");
    const local = validateContent(content, true);
    if (Object.keys(local).length) {
      setErrors(local); setMsg({ tone: "error", text: local.page ?? "Fix the highlighted fields before publishing." }); focusError(); return;
    }
    let v = version;
    if (dirty) {
      setBusy("save");
      const s = await call(`/api/pages/${p.id}`, "PUT", { title, content, expectedVersion: version });
      setBusy("");
      if (!s.ok) { if (s.status === 409) setConflict(s.j.current); else setMsg({ tone: "error", text: s.j.error ?? "We couldn’t save." }); return; }
      v = s.j.version; setVersion(v); setSaved(JSON.stringify([title, content])); setDirty(false);
    }
    setBusy("publish");
    const r = await call(`/api/pages/${p.id}/publish`, "POST", { expectedVersion: v });
    setBusy("");
    if (r.ok) { setLife("published"); setPubVer(r.j.version); setMsg({ tone: "ok", text: `Published as version ${r.j.version}. The link and QR code are live.` }); router.refresh(); }
    else { if (r.j.errors) setErrors(r.j.errors); setMsg({ tone: "error", text: r.j.error ?? "We couldn’t publish. Nothing changed." }); }
  }
  async function unpublish() {
    setDlg(""); setBusy("unpublish");
    const r = await call(`/api/pages/${p.id}/unpublish`, "POST");
    setBusy("");
    if (r.ok) { setLife("unpublished"); setMsg({ tone: "ok", text: "Unpublished. The link now shows an unavailable page. Your page is saved and can be published again." }); router.refresh(); }
    else setMsg({ tone: "error", text: r.j.error ?? "We couldn’t unpublish." });
  }
  async function del() {
    setDlg(""); setBusy("delete");
    const r = await call(`/api/pages/${p.id}`, "DELETE");
    setBusy("");
    if (r.ok) router.push("/workspace/pages?deleted=1"); else setMsg({ tone: "error", text: r.j.error ?? "We couldn’t delete." });
  }
  async function restore(v: number) {
    if (dirty && !confirm("Restoring replaces the unsaved changes on this screen. Continue?")) return;
    setBusy("restore");
    const r = await call(`/api/pages/${p.id}/restore`, "POST", { version: v, expectedVersion: version });
    setBusy("");
    if (r.ok) { setContent(r.j.card); setVersion(r.j.version); setSaved(JSON.stringify([title, r.j.card])); setDirty(false); setErrors({}); setMsg({ tone: "ok", text: `Version ${v} copied into your draft. It is not published until you publish.` }); }
    else setMsg({ tone: "error", text: r.j.error ?? "We couldn’t restore that version." });
  }

  const preview = useMemo(() => snapshotOfContent(content), [content]);
  const shown = preview.blocks.length - 1;

  // ----- pieces -----
  function rowList({ b, group, rows, setRows, max }: { b: Block; group: RowGroup; rows: CardRow[]; setRows: (r: CardRow[]) => void; max: number }) {
    const m = ROWS[group];
    return (
      <fieldset className="mb-4 min-w-0 border-0 p-0">
        <legend className="mb-2 text-sm font-medium">{m.title}</legend>
        {rows.map((r, i) => {
          const k = `${b.id}.${group === "socials" ? "items" : group}.${r.id}`; // keys match validateContent()
          const e = problem(k, () => rowProblem(group, r));
          const label = `${m.singular[0].toUpperCase()}${m.singular.slice(1)} ${i + 1}`;
          const upd = (c: Partial<CardRow>) => { clearErr(k); setRows(rows.map((x, n) => (n === i ? { ...x, ...c } : x))); };
          return (
            <div key={r.id} className="mb-3 rounded-control border border-divider p-3">
              <div className="grid gap-2 sm:grid-cols-[9rem_minmax(0,1fr)]">
                {m.labels.length ? (
                  <select aria-label={`${label} type`} className={`${controlClass} bg-surface`} value={r.label} onChange={(ev) => upd({ label: ev.target.value })}>
                    {m.labels.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                ) : <input aria-label={`${label} label (optional)`} className={controlClass} placeholder="Label" maxLength={30} value={r.label} onChange={(ev) => upd({ label: ev.target.value })} />}
                <input id={`${b.id}-${group}-${i}`} aria-label={label} aria-invalid={e ? true : undefined} aria-describedby={e ? `${k}-err` : undefined} inputMode={m.inputMode} placeholder={m.placeholder} maxLength={300} className={controlClass} value={r.value} onBlur={() => touch(k)} onChange={(ev) => upd({ value: ev.target.value })} />
              </div>
              {e ? <p id={`${k}-err`} className="mt-2 text-[13px] text-danger">{e}</p> : null}
              <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
                <label className="inline-flex min-h-12 items-center gap-2 text-sm"><input type="checkbox" className="size-5" checked={r.public} onChange={(ev) => upd({ public: ev.target.checked })} /> Show on the page</label>
                {group === "phones" ? <label className="inline-flex min-h-12 items-center gap-2 text-sm"><input type="checkbox" className="size-5" checked={!!r.whatsapp} onChange={(ev) => upd({ whatsapp: ev.target.checked })} /> WhatsApp button</label> : null}
                <Button variant="ghost" className="ml-auto" aria-label={`Remove ${label.toLowerCase()}`} onClick={() => { setRows(rows.filter((_, n) => n !== i)); focusSoon(`${b.id}-add-${group}`); }}>Remove</Button>
              </div>
            </div>
          );
        })}
        <Button id={`${b.id}-add-${group}`} variant="secondary" disabled={rows.length >= max} onClick={() => { setRows([...rows, { id: newRowId(), label: m.labels[0]?.id ?? (group === "socials" ? "instagram" : ""), value: "", public: true, ...(group === "phones" ? { whatsapp: false } : {}) }]); focusSoon(`${b.id}-${group}-${rows.length}`); }}>Add {m.singular}</Button>
        {rows.length >= max ? <p className="mt-1 text-[13px] text-muted">You can add up to {max}.</p> : null}
      </fieldset>
    );
  }

  function body(b: Exclude<Block, { type: "header" }>) {
    switch (b.type) {
      case "text":
        return <>
          <TextField id={`${b.id}-heading`} label="Heading (optional)" value={b.heading} maxLength={60} error={errors[`${b.id}.heading`]} onChange={(e) => patch(b.id, { heading: e.target.value }, `${b.id}.heading`)} />
          <TextArea id={`${b.id}-body`} label="Text" rows={4} value={b.body} maxLength={1200} error={errors[`${b.id}.body`]} help={`${b.body.length}/1200. Shown as plain text.`} onChange={(e) => patch(b.id, { body: e.target.value }, `${b.id}.body`)} />
        </>;
      case "actions":
        return <>
          <p className="mb-3 text-[13px] text-muted">The first phone, WhatsApp, email and website become big buttons. Everything listed shows underneath.</p>
          {rowList({ b, group: "phones", rows: b.phones, setRows: (r) => patch(b.id, { phones: r }), max: MAX_ACTION_ROWS })}
          {rowList({ b, group: "emails", rows: b.emails, setRows: (r) => patch(b.id, { emails: r }), max: MAX_ACTION_ROWS })}
          {rowList({ b, group: "websites", rows: b.websites, setRows: (r) => patch(b.id, { websites: r }), max: MAX_ACTION_ROWS })}
        </>;
      case "socials":
        return <>
          <TextField id={`${b.id}-heading`} label="Heading (optional)" value={b.heading} maxLength={60} onChange={(e) => patch(b.id, { heading: e.target.value })} />
          {rowList({ b, group: "socials", rows: b.items, setRows: (r) => patch(b.id, { items: r }), max: MAX_SOCIALS })}
        </>;
      case "links":
        return <>
          <TextField id={`${b.id}-heading`} label="Heading (optional)" value={b.heading} maxLength={60} onChange={(e) => patch(b.id, { heading: e.target.value })} />
          {b.items.map((it, i) => {
            const k = `${b.id}.items.${it.id}`;
            const e = problem(k, () => (it.url && !validUrl(it.url) ? "Enter a website address such as example.com or https://example.com/page (no spaces)." : null));
            const upd = (c: Partial<typeof it>) => { clearErr(k); patch(b.id, { items: b.items.map((x, n) => (n === i ? { ...x, ...c } : x)) }); };
            return (
              <div key={it.id} className="mb-3 rounded-control border border-divider p-3">
                <p className="mb-2 text-sm font-medium">Link {i + 1}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input aria-label={`Link ${i + 1} label`} className={controlClass} placeholder="Label people see" maxLength={60} value={it.label} onChange={(ev) => upd({ label: ev.target.value })} />
                  <input id={`${b.id}-link-${i}`} aria-label={`Link ${i + 1} address`} aria-invalid={e ? true : undefined} aria-describedby={e ? `${k}-err` : undefined} inputMode="url" className={controlClass} placeholder="example.com/page" maxLength={300} value={it.url} onBlur={() => touch(k)} onChange={(ev) => upd({ url: ev.target.value })} />
                </div>
                <input aria-label={`Link ${i + 1} short description (optional)`} className={`${controlClass} mt-2`} placeholder="Short description (optional)" maxLength={120} value={it.note} onChange={(ev) => upd({ note: ev.target.value })} />
                {e ? <p id={`${k}-err`} className="mt-2 text-[13px] text-danger">{e}</p> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button variant="ghost" id={`ml-${it.id}-up`} disabled={i === 0} aria-label={`Move link ${i + 1} up`} onClick={() => { patch(b.id, { items: move(b.items, i, -1) }); focusSoon(`ml-${it.id}-up`); }}>Move up</Button>
                  <Button variant="ghost" id={`ml-${it.id}-down`} disabled={i === b.items.length - 1} aria-label={`Move link ${i + 1} down`} onClick={() => { patch(b.id, { items: move(b.items, i, 1) }); focusSoon(`ml-${it.id}-down`); }}>Move down</Button>
                  <Button variant="ghost" className="ml-auto" aria-label={`Remove link ${i + 1}`} onClick={() => { patch(b.id, { items: b.items.filter((_, n) => n !== i) }); focusSoon(`${b.id}-add-link`); }}>Remove</Button>
                </div>
              </div>
            );
          })}
          <Button id={`${b.id}-add-link`} variant="secondary" disabled={b.items.length >= MAX_LINKS} onClick={() => { patch(b.id, { items: [...b.items, { id: newRowId(), label: "", url: "", note: "" }] }); focusSoon(`${b.id}-link-${b.items.length}`); }}>Add link</Button>
          {b.items.length >= MAX_LINKS ? <p className="mt-1 text-[13px] text-muted">You can add up to {MAX_LINKS}.</p> : null}
        </>;
      case "hours":
        return <>
          <div className="mb-4">
            <label htmlFor={`${b.id}-tz`} className="mb-2 block text-sm font-medium">Time zone</label>
            <input id={`${b.id}-tz`} list="tz-list" className={controlClass} value={b.timezone} aria-invalid={errors[`${b.id}.timezone`] || (touched.has(`${b.id}.tz`) && !validTimeZone(b.timezone)) ? true : undefined} onBlur={() => touch(`${b.id}.tz`)} onChange={(e) => patch(b.id, { timezone: e.target.value }, `${b.id}.timezone`)} />
            <datalist id="tz-list">{(typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["Africa/Lagos", "UTC"]).map((z) => <option key={z} value={z} />)}</datalist>
            {errors[`${b.id}.timezone`] || (touched.has(`${b.id}.tz`) && !validTimeZone(b.timezone)) ? <p className="mt-2 text-[13px] text-danger">Choose a valid time zone, for example Africa/Lagos.</p> : <p className="mt-2 text-[13px] text-muted">Hours are shown as written, in this time zone.</p>}
          </div>
          {b.days.map((d, i) => {
            const ek = errors[`${b.id}.day.${i}`];
            const upd = (c: Partial<typeof d>) => { clearErr(`${b.id}.day.${i}`); patch(b.id, { days: b.days.map((x, n) => (n === i ? { ...x, ...c } : x)) }); };
            return (
              <div key={i} className="mb-2 flex flex-wrap items-center gap-3">
                <span className="w-24 text-sm">{DAY_NAMES[i]}</span>
                <label className="inline-flex min-h-12 items-center gap-2 text-sm"><input type="checkbox" className="size-5" checked={d.closed} onChange={(e) => upd({ closed: e.target.checked })} /> Closed</label>
                {!d.closed ? <>
                  <input type="time" aria-label={`${DAY_NAMES[i]} opens`} aria-invalid={ek ? true : undefined} className={`${controlClass} !w-32`} value={d.open} onChange={(e) => upd({ open: e.target.value })} />
                  <span aria-hidden="true">to</span>
                  <input type="time" aria-label={`${DAY_NAMES[i]} closes`} aria-invalid={ek ? true : undefined} className={`${controlClass} !w-32`} value={d.close} onChange={(e) => upd({ close: e.target.value })} />
                </> : null}
                {ek ? <p className="basis-full text-[13px] text-danger">{ek}</p> : null}
              </div>
            );
          })}
          <TextField id={`${b.id}-note`} label="Note (optional)" value={b.note} maxLength={160} help="e.g. Closed on public holidays." onChange={(e) => patch(b.id, { note: e.target.value })} />
        </>;
      case "location":
        return <>
          <TextArea id={`${b.id}-address`} label="Address" rows={3} value={b.address} maxLength={200} help="A “Get directions” button opens this address in Google Maps." onChange={(e) => patch(b.id, { address: e.target.value })} />
          <TextField id={`${b.id}-lnote`} label="Directions note (optional)" value={b.note} maxLength={200} onChange={(e) => patch(b.id, { note: e.target.value })} />
        </>;
      case "button": {
        const e = problem(`${b.id}.url`, () => (b.url && !validUrl(b.url) ? "Enter a website address such as example.com or https://example.com/page (no spaces)." : null));
        return <>
          <TextField id={`${b.id}-label`} label="Button label" value={b.label} maxLength={40} error={errors[`${b.id}.label`]} onChange={(ev) => patch(b.id, { label: ev.target.value }, `${b.id}.label`)} />
          <TextField id={`${b.id}-url`} label="Button address" inputMode="url" placeholder="example.com/page" value={b.url} maxLength={300} error={e} onBlur={() => touch(`${b.id}.url`)} onChange={(ev) => patch(b.id, { url: ev.target.value }, `${b.id}.url`)} />
        </>;
      }
    }
  }

  return (
    <div className="grid gap-8 min-[1100px]:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
      <div className="min-w-0">
        <p className="mb-4 text-sm text-muted">
          <span className="font-medium text-ink">{info.label}</span> · <span className="font-medium text-ink">{LIFE[life] ?? life}</span>
          {pubVer ? ` · live version ${pubVer}` : ""}{dirty ? " · unsaved changes" : ""}
        </p>
        {p.takenDown ? <Notice tone="error" title="This page has been disabled by Qrenuvi" live>It cannot be published. Contact support if you think this is a mistake.</Notice> : null}
        {!p.canEdit && !p.takenDown ? <Notice tone="warning" title="Editing needs an active Pro or Business plan" live>Your page is kept. {live ? "It stays visible for a grace period after your plan ends. " : ""}You can still unpublish or delete it. <a className="text-brand" href="/pricing">See plans</a></Notice> : null}
        {conflict ? (
          <div role="alertdialog" aria-labelledby="cf-t" className="my-6 rounded-control border border-danger bg-surface p-4">
            <h2 id="cf-t" className="mb-1 text-lg font-medium">This page was changed somewhere else</h2>
            <p className="mb-3 text-sm text-muted">Another tab or device saved version {conflict.version} while you were editing. Your edits are still here and nothing was overwritten.</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => { setVersion(conflict.version); setConflict(null); setDirty(true); setMsg({ tone: "ok", text: "Kept your edits on top of the latest version. Save to apply them." }); }}>Keep my edits</Button>
              <Button variant="secondary" onClick={() => { setContent(conflict.card); setTitle(conflict.title); setVersion(conflict.version); setSaved(JSON.stringify([conflict.title, conflict.card])); setDirty(false); setConflict(null); }}>Load the latest instead</Button>
            </div>
          </div>
        ) : null}
        <fieldset disabled={ro} className="min-w-0 border-0 p-0">
          <TextField id="page-title" label="Page name (only you see this)" value={title} maxLength={80} onChange={(e) => edit(content, e.target.value)} help="Used in your list so you can tell pages apart." />
          {header ? (
            <section aria-labelledby="hdr-h" className="mb-6 rounded-panel border border-divider p-4">
              <h2 id="hdr-h" className="mb-3 text-lg font-medium">Top of the page</h2>
              {info.portrait ? <PhotoField pageId={p.id} name={header.name} mediaId={header.portraitId} disabled={ro} onChange={(id) => patch(header.id, { portraitId: id })} setError={(t) => t && setMsg({ tone: "error", text: t })} /> : null}
              {info.logo ? <LogoField pageId={p.id} mediaId={header.logoId} disabled={ro} onChange={(id) => patch(header.id, { logoId: id })} setError={(t) => t && setMsg({ tone: "error", text: t })} /> : null}
              <TextField id="hdr-name" label="Name" value={header.name} maxLength={80} autoComplete="off" error={errors[`${header.id}.name`]} onChange={(e) => patch(header.id, { name: e.target.value }, `${header.id}.name`)} />
              <TextField id="hdr-tagline" label="Tagline (optional)" value={header.tagline} maxLength={120} placeholder={info.tagline} error={errors[`${header.id}.tagline`]} onChange={(e) => patch(header.id, { tagline: e.target.value }, `${header.id}.tagline`)} />
            </section>
          ) : null}

          {content.blocks.slice(1).map((b, n) => {
            const i = n + 1;
            if (b.type === "header") return null;
            return (
              <section key={b.id} aria-labelledby={`sec-${b.id}`} className="mb-6 rounded-panel border border-divider p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <h2 id={`sec-${b.id}`} tabIndex={-1} className="mr-auto text-lg font-medium">{NAMES[b.type]}{b.hidden ? " (hidden)" : ""}</h2>
                  <Button variant="ghost" id={`mv-${b.id}-up`} disabled={i === 1} aria-label={`Move ${NAMES[b.type]} section up`} onClick={() => moveBlock(i, -1)}>Move up</Button>
                  <Button variant="ghost" id={`mv-${b.id}-down`} disabled={i === content.blocks.length - 1} aria-label={`Move ${NAMES[b.type]} section down`} onClick={() => moveBlock(i, 1)}>Move down</Button>
                </div>
                {body(b)}
                <div className="mt-2 flex flex-wrap items-center gap-4 border-t border-divider pt-2">
                  <label className="inline-flex min-h-12 items-center gap-2 text-sm"><input type="checkbox" className="size-5" checked={b.hidden} onChange={(e) => patch(b.id, { hidden: e.target.checked })} /> Hide this section (keep it, but don’t show it)</label>
                  <Button variant="ghost" className="ml-auto !text-danger" aria-label={`Remove ${NAMES[b.type]} section`} onClick={() => removeBlock(i)}>Remove section</Button>
                </div>
              </section>
            );
          })}
          {errors.page ? <p role="alert" className="mb-4 text-sm text-danger">{errors.page}</p> : null}
          <div className="mb-6 flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="add-type" className="mb-2 block text-sm font-medium">Add a section</label>
              <select id="add-type" className={`${controlClass} bg-surface sm:!w-64`} value={toAdd || addable[0] || ""} disabled={!addable.length} onChange={(e) => setToAdd(e.target.value)}>
                {addable.map((t) => <option key={t} value={t}>{NAMES[t]}</option>)}
              </select>
            </div>
            <Button id="add-section" variant="secondary" disabled={!addable.length || content.blocks.length >= 20} onClick={addSection}>Add section</Button>
          </div>

          <fieldset className="mb-6 min-w-0 border-0 p-0">
            <legend className="mb-2 text-sm font-medium">Colour</legend>
            <div className="flex flex-wrap gap-2">
              {ACCENTS.map((a) => (
                <label key={a.id} className={`inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-control border px-4 ${content.accent === a.id ? "border-brand bg-soft" : "border-control-border"}`}>
                  <input type="radio" name="accent" className="size-5" checked={content.accent === a.id} onChange={() => edit({ ...content, accent: a.id })} />
                  <span aria-hidden="true" className="size-5 rounded-full" style={{ background: a.bg }} /> {a.label}
                </label>
              ))}
            </div>
          </fieldset>
        </fieldset>

        <div role="status" aria-live="polite" className="min-h-6">
          {msg ? <p className={`mb-3 text-sm ${msg.tone === "error" ? "text-danger" : "text-brand"}`}>{msg.text}</p> : null}
        </div>
        <div className="mb-8 flex flex-wrap gap-2">
          <Button onClick={save} disabled={ro || busy !== "" || !dirty}>{busy === "save" ? "Saving…" : "Save draft"}</Button>
          <Button variant="secondary" onClick={() => setDlg("publish")} disabled={ro || busy !== ""}>{live ? "Publish changes" : "Publish"}</Button>
          {live ? <Button variant="secondary" onClick={() => setDlg("unpublish")} disabled={busy !== ""}>Unpublish</Button> : null}
          <Button variant="ghost" className="!text-danger" onClick={() => setDlg("delete")} disabled={busy !== ""}>Delete page</Button>
        </div>

        <section aria-labelledby="share-h" className="mb-8 rounded-panel bg-surface p-5">
          <h2 id="share-h" className="mb-2 text-xl font-medium">Link and QR code</h2>
          <p className="mb-3 break-all text-sm"><span className="text-muted">Permanent address: </span><a className="text-brand" href={p.publicUrl}>{p.publicUrl}</a></p>
          <div className="mb-3 size-44 rounded-control border border-divider bg-white p-2" role="img" aria-label="QR code for the page address" dangerouslySetInnerHTML={{ __html: p.qrSvg }} />
          <div className="flex flex-wrap gap-2">
            <a className="inline-flex min-h-12 items-center rounded-control border border-brand px-5 text-brand no-underline hover:bg-soft" href={`/api/pages/${p.id}/qr?format=svg`} download>Download SVG</a>
            <a className="inline-flex min-h-12 items-center rounded-control border border-brand px-5 text-brand no-underline hover:bg-soft" href={`/api/pages/${p.id}/qr?format=png`} download>Download PNG</a>
          </div>
          <p className="mt-3 text-[13px] text-muted">This address and QR code never change when you edit or republish. {live ? "" : "People see a neutral “not available” page until you publish."}</p>
        </section>

        {p.revisions.length ? (
          <section aria-labelledby="rev-h" className="mb-8">
            <h2 id="rev-h" className="mb-2 text-xl font-medium">Published versions</h2>
            <ul className="m-0 list-none divide-y divide-divider p-0">
              {p.revisions.map((r) => (
                <li key={r.version} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>Version {r.version}{r.version === pubVer && live ? " (live)" : ""} · {new Date(r.published_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
                  <Button variant="ghost" disabled={ro || busy !== ""} aria-label={`Copy version ${r.version} into my draft`} onClick={() => restore(r.version)}>Copy into draft</Button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[13px] text-muted">Older versions keep only what was shown publicly. Hidden sections are not stored in history. The last 20 versions are kept.</p>
          </section>
        ) : null}
      </div>

      <aside aria-label="Live preview" className="min-w-0 min-[1100px]:sticky min-[1100px]:top-6 min-[1100px]:self-start">
        <h2 className="mb-2 text-sm font-medium text-muted">Preview of your draft (shows what visitors will see)</h2>
        <PreviewBoundary resetKey={preview}><BlocksView s={preview} mediaBase={`/api/pages/${p.id}/media`} vcfHref={null} preview /></PreviewBoundary>
      </aside>

      <Dialog open={dlg === "publish"} onClose={() => setDlg("")} title={live ? "Publish these changes?" : "Publish this page?"}>
        <p className="mb-2 text-muted">Anyone with the link or QR code can see this page without signing in.</p>
        <ul className="mb-4 list-disc pl-5 text-sm">
          <li>{shown} section{shown === 1 ? "" : "s"} will be public. Hidden sections and unfinished entries are left out.</li>
          {content.kind === "business" ? <li>The Save contact file includes only the public phone numbers, emails, websites, profiles and address.</li> : null}
          <li>{dirty ? "Your unsaved changes will be saved first." : "Address and QR code stay the same."}</li>
        </ul>
        <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" data-autofocus onClick={() => setDlg("")}>Cancel</Button><Button onClick={publish}>{live ? "Publish changes" : "Publish"}</Button></div>
      </Dialog>
      <Dialog open={dlg === "unpublish"} onClose={() => setDlg("")} title="Unpublish this page?">
        <p className="mb-4 text-muted">The link and any printed QR codes will show “This page isn’t available” until you publish again. Nothing is deleted.</p>
        <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" data-autofocus onClick={() => setDlg("")}>Cancel</Button><Button onClick={unpublish}>Unpublish</Button></div>
      </Dialog>
      <Dialog open={dlg === "delete"} onClose={() => setDlg("")} title="Delete this page?">
        <p className="mb-4 text-muted">The page, its images and its versions are removed from your account. Its address is retired for good and shows “not available”. This cannot be undone.</p>
        <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" data-autofocus onClick={() => setDlg("")}>Keep page</Button><Button variant="danger" onClick={del}>Delete page</Button></div>
      </Dialog>
    </div>
  );
}
