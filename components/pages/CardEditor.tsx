"use client";
import { GRACE_DAYS } from "@/lib/pages/policy";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import CardView from "@/components/pages/CardView";
import LogoField from "@/components/pages/LogoField";
import PhotoField from "@/components/pages/PhotoField";
import { Button } from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import { TextArea, TextField, controlClass } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import PreviewBoundary from "@/components/pages/PreviewBoundary";
import { ACCENTS, MAX_ROWS, ROW_GROUPS, newRowId, rowProblem, snapshotOf, validateCard, type Card, type CardErrors, type RowGroup } from "@/lib/pages/card";
import { GROUPS } from "@/lib/qr-contact";

type Rev = { version: number; published_at: string };
type Props = {
  id: string; initialTitle: string; initialCard: Card; version: number; lifecycle: string; publishedVersion: number | null;
  publicUrl: string; revisions: Rev[]; canEdit: boolean; takenDown: boolean; qrSvg: string;
};

const META: Record<RowGroup, { title: string; singular: string; placeholder: string; inputMode: "tel" | "email" | "url" | "text"; labels: { id: string; label: string }[] }> = {
  phones: { title: "Phone numbers", singular: "phone number", placeholder: "+234 800 000 0000", inputMode: "tel", labels: GROUPS.phone.types },
  emails: { title: "Email addresses", singular: "email address", placeholder: "name@example.com", inputMode: "email", labels: GROUPS.email.types },
  websites: { title: "Websites", singular: "website", placeholder: "example.com", inputMode: "url", labels: [] },
  socials: { title: "Social profiles", singular: "social profile", placeholder: "handle or https:// address", inputMode: "text", labels: GROUPS.social.types },
};
const LIFE: Record<string, string> = { draft: "Draft, not published", published: "Published", unpublished: "Unpublished", archived: "Archived" };

export default function CardEditor(p: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(p.initialTitle);
  const [card, setCard] = useState<Card>(p.initialCard);
  const [version, setVersion] = useState(p.version);
  const [life, setLife] = useState(p.lifecycle);
  const [pubVer, setPubVer] = useState(p.publishedVersion);
  const saved = useRef(JSON.stringify([p.initialTitle, p.initialCard]));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"" | "save" | "publish" | "unpublish" | "delete" | "restore">("");
  const [errors, setErrors] = useState<CardErrors>({});
  const [touched, setTouched] = useState<Set<string>>(new Set()); // row values the person has left, so we only judge finished input
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [conflict, setConflict] = useState<{ version: number; title: string; card: Card } | null>(null);
  const [dlg, setDlg] = useState<"" | "publish" | "unpublish" | "delete">("");
  const ro = !p.canEdit || life === "archived" || p.takenDown;

  function edit(next: Card, t = title) {
    setCard(next); setTitle(t);
    setDirty(JSON.stringify([t, next]) !== saved.current);
    setMsg(null);
  }
  const set = <K extends keyof Card>(k: K, v: Card[K]) => edit({ ...card, [k]: v });
  const setRow = (g: RowGroup, i: number, patch: Partial<Card[RowGroup][number]>) => {
    const k = `${g}.${i}.value`;
    if (errors[k]) setErrors((x) => { const n = { ...x }; delete n[k]; return n; }); // a saved-error message is about the old text; judge the new text instead
    edit({ ...card, [g]: card[g].map((r, n) => (n === i ? { ...r, ...patch } : r)) });
  };
  const leave = (g: RowGroup, i: number) => setTouched((t) => new Set(t).add(`${g}.${card[g][i]?.id}`));
  const addRow = (g: RowGroup) => {
    if (card[g].length >= MAX_ROWS) return;
    edit({ ...card, [g]: [...card[g], { id: newRowId(), label: META[g].labels[0]?.id ?? (g === "socials" ? "instagram" : ""), value: "", public: true, ...(g === "phones" ? { whatsapp: false } : {}) }] });
    setTimeout(() => document.getElementById(`${g}-${card[g].length}`)?.focus(), 0);
  };
  const removeRow = (g: RowGroup, i: number) => {
    edit({ ...card, [g]: card[g].filter((_, n) => n !== i) });
    setTimeout(() => (document.getElementById(`${g}-${Math.max(0, i - 1)}`) ?? document.getElementById(`add-${g}`))?.focus(), 0);
  };

  async function call(path: string, method: string, body?: unknown) {
    try {
      const r = await fetch(path, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      return { ok: r.ok, status: r.status, j: await r.json().catch(() => ({})) };
    } catch {
      return { ok: false, status: 0, j: { error: "We couldn’t reach Qrenuvi. Your changes are still on this screen. Check your connection and try again." } };
    }
  }

  async function save(): Promise<boolean> {
    setBusy("save"); setMsg(null);
    const r = await call(`/api/pages/${p.id}`, "PUT", { title, card, expectedVersion: version });
    setBusy("");
    if (r.ok) { setVersion(r.j.version); saved.current = JSON.stringify([title, card]); setDirty(false); setErrors({}); setMsg({ tone: "ok", text: "Draft saved." }); return true; }
    if (r.status === 409 && r.j.code === "conflict") { setConflict(r.j.current); return false; }
    if (r.j.errors) setErrors(r.j.errors);
    setMsg({ tone: "error", text: r.j.error ?? "We couldn’t save." });
    if (r.j.errors) setTimeout(() => document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus(), 0);
    return false;
  }

  async function publish() {
    setDlg("");
    const local = validateCard(card, true);
    if (Object.keys(local).length) { setErrors(local); setMsg({ tone: "error", text: "Fix the highlighted fields before publishing." }); setTimeout(() => document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus(), 0); return; }
    let v = version;
    if (dirty) {
      setBusy("save");
      const s = await call(`/api/pages/${p.id}`, "PUT", { title, card, expectedVersion: version });
      setBusy("");
      if (!s.ok) { if (s.status === 409) setConflict(s.j.current); else setMsg({ tone: "error", text: s.j.error ?? "We couldn’t save." }); return; }
      v = s.j.version; setVersion(v); saved.current = JSON.stringify([title, card]); setDirty(false);
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
    if (r.ok) { setLife("unpublished"); setMsg({ tone: "ok", text: "Unpublished. The link now shows an unavailable page. Your card is saved and can be published again." }); router.refresh(); }
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
    if (r.ok) { setCard(r.j.card); setVersion(r.j.version); saved.current = JSON.stringify([title, r.j.card]); setDirty(false); setMsg({ tone: "ok", text: `Version ${v} copied into your draft. It is not published until you publish.` }); }
    else setMsg({ tone: "error", text: r.j.error ?? "We couldn’t restore that version." });
  }

  const preview = useMemo(() => snapshotOf(card), [card]);
  const publicRows = ROW_GROUPS.reduce((n, g) => n + card[g].filter((r) => r.value && r.public).length, 0);
  const privateRows = ROW_GROUPS.reduce((n, g) => n + card[g].filter((r) => r.value && !r.public).length, 0);
  const err = (k: string) => errors[k] ?? null;
  const live = life === "published";

  return (
    <div className="grid gap-8 min-[1100px]:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
      <div className="min-w-0">
        <p className="mb-4 text-sm text-muted">
          <span className="font-medium text-ink">{LIFE[life] ?? life}</span>
          {pubVer ? ` · live version ${pubVer}` : ""}{dirty ? " · unsaved changes" : ""}
        </p>
        {p.takenDown ? <Notice tone="error" title="This page has been disabled by Qrenuvi" live>It cannot be published. Contact support if you think this is a mistake.</Notice> : null}
        {!p.canEdit && !p.takenDown ? <Notice tone="warning" title="Editing needs an active Pro or Business plan" live>Your card is kept. {live ? `It stays visible for ${GRACE_DAYS} days after your plan ends. ` : ""}You can still unpublish or delete it. <a className="text-brand" href="/pricing">See plans</a></Notice> : null}
        {conflict ? (
          <div role="alertdialog" aria-labelledby="cf-t" className="my-6 rounded-control border border-danger bg-surface p-4">
            <h2 id="cf-t" className="mb-1 text-lg font-medium">This card was changed somewhere else</h2>
            <p className="mb-3 text-sm text-muted">Another tab or device saved version {conflict.version} while you were editing. Your edits are still here and nothing was overwritten.</p>
            <ul className="mb-3 list-disc pl-5 text-sm">
              {(["name", "role", "company", "intro"] as const).filter((k) => conflict.card[k] !== card[k]).map((k) => <li key={k}>{k}: saved copy says “{conflict.card[k] || "(empty)"}”, yours says “{card[k] || "(empty)"}”</li>)}
              {ROW_GROUPS.filter((g) => JSON.stringify(conflict.card[g]) !== JSON.stringify(card[g])).map((g) => <li key={g}>{META[g].title} differ ({conflict.card[g].length} saved, {card[g].length} yours)</li>)}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => { setVersion(conflict.version); setConflict(null); setDirty(true); setMsg({ tone: "ok", text: "Kept your edits on top of the latest version. Save to apply them." }); }}>Keep my edits</Button>
              <Button variant="secondary" onClick={() => { setCard(conflict.card); setTitle(conflict.title); setVersion(conflict.version); saved.current = JSON.stringify([conflict.title, conflict.card]); setDirty(false); setConflict(null); }}>Load the latest instead</Button>
            </div>
          </div>
        ) : null}
        <fieldset disabled={ro} className="min-w-0 border-0 p-0">
          <TextField id="card-title" label="Card name (only you see this)" value={title} maxLength={80} onChange={(e) => edit(card, e.target.value)} help="Used in your list so you can tell cards apart." />
          <PhotoField pageId={p.id} name={card.name} mediaId={card.portraitId} disabled={ro} onChange={(id) => set("portraitId", id)} setError={(t) => t && setMsg({ tone: "error", text: t })} />
          <LogoField pageId={p.id} mediaId={card.logoId} disabled={ro} onChange={(id) => set("logoId", id)} setError={(t) => t && setMsg({ tone: "error", text: t })} />
          <TextField id="name" label="Name" value={card.name} maxLength={80} autoComplete="off" error={err("name")} onChange={(e) => set("name", e.target.value)} />
          <TextField id="role" label="Job title" value={card.role} maxLength={80} error={err("role")} onChange={(e) => set("role", e.target.value)} />
          <TextField id="company" label="Company" value={card.company} maxLength={80} error={err("company")} onChange={(e) => set("company", e.target.value)} />
          <TextArea id="intro" label="Introduction" rows={3} value={card.intro} maxLength={280} error={err("intro")} help={`${card.intro.length}/280. Shown as plain text.`} onChange={(e) => set("intro", e.target.value)} />
          {err("contact") ? <p role="alert" className="mb-4 text-sm text-danger">{err("contact")}</p> : null}
          {ROW_GROUPS.map((g) => {
            const m = META[g];
            return (
              <fieldset key={g} className="mb-6 min-w-0 border-0 p-0">
                <legend className="mb-2 text-sm font-medium">{m.title}</legend>
                {card[g].map((r, i) => {
                  const e = err(`${g}.${i}.value`) ?? (touched.has(`${g}.${r.id}`) ? rowProblem(g, r) : null);
                  const label = `${m.singular[0].toUpperCase()}${m.singular.slice(1)} ${i + 1}`;
                  return (
                    <div key={r.id} className="mb-4 rounded-control border border-divider p-3">
                      <div className="grid gap-2 sm:grid-cols-[9rem_minmax(0,1fr)]">
                        {m.labels.length ? (
                          <select aria-label={`${label} type`} className={`${controlClass} bg-surface`} value={r.label} onChange={(ev) => setRow(g, i, { label: ev.target.value })}>
                            {m.labels.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                          </select>
                        ) : (
                          <input aria-label={`${label} label (optional)`} className={controlClass} placeholder="Label, e.g. Portfolio" maxLength={30} value={r.label} onChange={(ev) => setRow(g, i, { label: ev.target.value })} />
                        )}
                        <input id={`${g}-${i}`} aria-label={label} aria-invalid={e ? true : undefined} aria-describedby={e ? `${g}-${i}-err` : undefined} inputMode={m.inputMode} placeholder={m.placeholder} maxLength={300} className={controlClass} value={r.value} onBlur={() => leave(g, i)} onChange={(ev) => setRow(g, i, { value: ev.target.value })} />
                      </div>
                      {e ? <p id={`${g}-${i}-err`} className="mt-2 text-[13px] text-danger">{e}</p> : null}
                      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
                        <label className="inline-flex min-h-12 items-center gap-2 text-sm"><input type="checkbox" className="size-5" checked={r.public} onChange={(ev) => setRow(g, i, { public: ev.target.checked })} /> Show on the card and in the saved contact</label>
                        {g === "phones" ? <label className="inline-flex min-h-12 items-center gap-2 text-sm"><input type="checkbox" className="size-5" checked={!!r.whatsapp} onChange={(ev) => setRow(g, i, { whatsapp: ev.target.checked })} /> WhatsApp button</label> : null}
                        <Button variant="ghost" className="ml-auto" aria-label={`Remove ${label.toLowerCase()}`} onClick={() => removeRow(g, i)}>Remove</Button>
                      </div>
                    </div>
                  );
                })}
                <Button id={`add-${g}`} variant="secondary" disabled={card[g].length >= MAX_ROWS} onClick={() => addRow(g)}>
                  Add {m.singular}
                </Button>
                {card[g].length >= MAX_ROWS ? <p className="mt-1 text-[13px] text-muted">You can add up to {MAX_ROWS}.</p> : null}
              </fieldset>
            );
          })}
          <fieldset className="mb-6 min-w-0 border-0 p-0">
            <legend className="mb-2 text-sm font-medium">Colour</legend>
            <div className="flex flex-wrap gap-2">
              {ACCENTS.map((a) => (
                <label key={a.id} className={`inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-control border px-4 ${card.accent === a.id ? "border-brand bg-soft" : "border-control-border"}`}>
                  <input type="radio" name="accent" className="size-5" checked={card.accent === a.id} onChange={() => set("accent", a.id)} />
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
          <Button variant="ghost" className="!text-danger" onClick={() => setDlg("delete")} disabled={busy !== ""}>Delete card</Button>
        </div>

        <section aria-labelledby="share-h" className="mb-8 rounded-panel bg-surface p-5">
          <h2 id="share-h" className="mb-2 text-xl font-medium">Link and QR code</h2>
          <p className="mb-3 break-all text-sm"><span className="text-muted">Permanent address: </span><a className="text-brand" href={p.publicUrl}>{p.publicUrl}</a></p>
          <div className="mb-3 size-44 rounded-control border border-divider bg-white p-2" role="img" aria-label="QR code for the card address" dangerouslySetInnerHTML={{ __html: p.qrSvg }} />
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
            <p className="mt-2 text-[13px] text-muted">Older versions keep only what was shown publicly. Hidden details are not stored in history. The last 20 versions are kept.</p>
          </section>
        ) : null}
      </div>

      <aside aria-label="Live preview" className="min-w-0 min-[1100px]:sticky min-[1100px]:top-6 min-[1100px]:self-start">
        <h2 className="mb-2 text-sm font-medium text-muted">Preview of your draft (shows what recipients will see)</h2>
        <PreviewBoundary resetKey={preview}><CardView s={preview} mediaBase={`/api/pages/${p.id}/media`} vcfHref={null} preview /></PreviewBoundary>
      </aside>

      <Dialog open={dlg === "publish"} onClose={() => setDlg("")} title={live ? "Publish these changes?" : "Publish this card?"}>
        <p className="mb-2 text-muted">Anyone with the link or QR code can see this card without signing in.</p>
        <ul className="mb-4 list-disc pl-5 text-sm">
          <li>{publicRows} contact detail{publicRows === 1 ? "" : "s"} will be public{privateRows ? `; ${privateRows} hidden detail${privateRows === 1 ? " stays" : "s stay"} private` : ""}.</li>
          <li>The saved contact file includes only the public details{card.portraitId ? " and your small photo" : ""}.</li>
          <li>{dirty ? "Your unsaved changes will be saved first." : "Address and QR code stay the same."}</li>
        </ul>
        <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" data-autofocus onClick={() => setDlg("")}>Cancel</Button><Button onClick={publish}>{live ? "Publish changes" : "Publish"}</Button></div>
      </Dialog>
      <Dialog open={dlg === "unpublish"} onClose={() => setDlg("")} title="Unpublish this card?">
        <p className="mb-4 text-muted">The link and any printed QR codes will show “This page isn’t available” until you publish again. Nothing is deleted.</p>
        <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" data-autofocus onClick={() => setDlg("")}>Cancel</Button><Button onClick={unpublish}>Unpublish</Button></div>
      </Dialog>
      <Dialog open={dlg === "delete"} onClose={() => setDlg("")} title="Delete this card?">
        <p className="mb-4 text-muted">The card, its photos and its versions are removed from your account. Its address is retired for good and shows “not available”. This cannot be undone.</p>
        <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" data-autofocus onClick={() => setDlg("")}>Keep card</Button><Button variant="danger" onClick={del}>Delete card</Button></div>
      </Dialog>
    </div>
  );
}
