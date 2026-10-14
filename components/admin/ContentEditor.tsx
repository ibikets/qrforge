"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { controlClass } from "@/components/ui/Field";
import { ActionButton } from "@/components/admin/Mutation";
import { FaqBlock, UsesBlock } from "@/components/landing/Blocks";
import { LIMITS, type Landing } from "@/lib/content";

const TABS = [
  ["hero", "Headline and button"],
  ["uses", "Popular uses"],
  ["plans", "Plan teasers"],
  ["faq", "Questions"],
  ["footer", "Footer links"],
] as const;
type Tab = (typeof TABS)[number][0];
type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: string } | { kind: "error"; message: string; field?: string; conflict?: boolean };

export default function ContentEditor({ initial, version, canPublish, publishedSame }: { initial: Landing; version: number; canPublish: boolean; publishedSame: boolean }) {
  const router = useRouter();
  const [data, setData] = useState<Landing>(initial);
  const [ver, setVer] = useState(version);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<Tab>("hero");
  const [st, setSt] = useState<Status>({ kind: "idle" });
  const busy = useRef(false);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const edit = (fn: (d: Landing) => Landing) => { setData((d) => fn(structuredClone(d))); setDirty(true); if (st.kind !== "idle") setSt({ kind: "idle" }); };

  async function save() {
    if (busy.current) return;
    busy.current = true;
    setSt({ kind: "saving" });
    try {
      const res = await fetch("/api/admin/content", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save_draft", data, version: ver }), credentials: "same-origin" });
      const j = (await res.json().catch(() => ({}))) as { version?: number; error?: string; field?: string };
      if (res.ok && typeof j.version === "number") {
        setVer(j.version); setDirty(false); setSt({ kind: "saved", at: new Date().toLocaleTimeString("en-GB", { timeZone: "Africa/Lagos" }) }); router.refresh();
      } else {
        setSt({ kind: "error", message: j.error ?? "Could not save. Your changes are still here.", field: j.field, conflict: res.status === 409 });
        if (j.field) { const el = document.querySelector<HTMLElement>(`[data-field="${j.field}"]`); setTab((j.field.split(".")[0] as Tab) in Object.fromEntries(TABS) ? (j.field.split(".")[0] as Tab) : tab); setTimeout(() => el?.focus(), 50); }
      }
    } catch {
      setSt({ kind: "error", message: "Could not reach the server. Your changes are still here." });
    }
    busy.current = false;
  }

  const err = (f: string) => (st.kind === "error" && st.field === f ? st.message : null);
  const field = (f: string, label: string, value: string, set: (v: string) => void, o: { max: number; area?: boolean }) => {
    const id = `ce-${f.replace(/\./g, "-")}`;
    const e = err(f);
    const props = { id, "data-field": f, value, maxLength: o.max, "aria-invalid": e ? true : undefined, "aria-describedby": e ? `${id}-e` : undefined, onChange: (ev: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => set(ev.target.value) };
    return (
      <div className="mb-4" key={f}>
        <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
        {o.area ? <textarea className={`${controlClass} resize-y`} rows={3} {...props} /> : <input className={controlClass} {...props} />}
        <p className="mt-1 text-[13px] text-muted">{value.length}/{o.max}</p>
        {e ? <p id={`${id}-e`} className="text-[13px] text-danger">{e}</p> : null}
      </div>
    );
  };

  function onTabKey(e: React.KeyboardEvent, i: number) {
    const n = TABS.length;
    const to = e.key === "ArrowRight" || e.key === "ArrowDown" ? (i + 1) % n : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (to < 0) return;
    e.preventDefault(); setTab(TABS[to][0]); tabRefs.current[TABS[to][0]]?.focus();
  }

  return (
    <div className="grid gap-8 min-[1100px]:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <div>
        <div role="tablist" aria-label="Landing sections" className="mb-5 flex flex-wrap gap-2">
          {TABS.map(([id, label], i) => (
            <button key={id} ref={(el) => { tabRefs.current[id] = el; }} role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)} onKeyDown={(e) => onTabKey(e, i)}
              className={`min-h-11 rounded-control border px-4 text-sm font-medium ${tab === id ? "border-brand bg-soft text-brand" : "border-divider text-muted hover:text-ink"}`}>{label}</button>
          ))}
        </div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="rounded-panel bg-surface p-5 sm:p-6">
          {tab === "hero" && (
            <>
              {field("hero.headline", "Headline", data.hero.headline, (v) => edit((d) => { d.hero.headline = v; return d; }), { max: LIMITS.headline })}
              {field("hero.support", "Support line", data.hero.support, (v) => edit((d) => { d.hero.support = v; return d; }), { max: LIMITS.support, area: true })}
              {field("hero.cta", "Button label", data.hero.cta, (v) => edit((d) => { d.hero.cta = v; return d; }), { max: LIMITS.cta })}
              {field("hero.freeNote", "Free plan note", data.hero.freeNote, (v) => edit((d) => { d.hero.freeNote = v; return d; }), { max: LIMITS.freeNote })}
            </>
          )}
          {tab === "uses" && (
            <>
              {data.uses.map((u, i) => (
                <fieldset key={i} className="mb-5 border-b border-divider pb-4">
                  <legend className="mb-2 font-medium">Use {i + 1}</legend>
                  {field(`uses.${i}.title`, "Title", u.title, (v) => edit((d) => { d.uses[i].title = v; return d; }), { max: LIMITS.useTitle })}
                  {field(`uses.${i}.body`, "Description", u.body, (v) => edit((d) => { d.uses[i].body = v; return d; }), { max: LIMITS.useBody, area: true })}
                  <Button variant="ghost" onClick={() => edit((d) => { d.uses.splice(i, 1); return d; })} disabled={data.uses.length <= 1}>Remove use {i + 1}</Button>
                </fieldset>
              ))}
              <Button variant="secondary" disabled={data.uses.length >= LIMITS.usesMax} onClick={() => edit((d) => { d.uses.push({ title: "", body: "" }); return d; })}>Add a use</Button>
            </>
          )}
          {tab === "plans" && (
            <>
              <p className="mb-4 text-sm text-muted">Prices are not edited here. They come from the plan versions and any live public offer, so a teaser can never disagree with checkout.</p>
              {field("plans.pro", "Pro teaser", data.plans.pro, (v) => edit((d) => { d.plans.pro = v; return d; }), { max: LIMITS.plan, area: true })}
              {field("plans.business", "Business teaser", data.plans.business, (v) => edit((d) => { d.plans.business = v; return d; }), { max: LIMITS.plan, area: true })}
            </>
          )}
          {tab === "faq" && (
            <>
              {data.faq.map((f, i) => (
                <fieldset key={i} className="mb-5 border-b border-divider pb-4">
                  <legend className="mb-2 font-medium">Question {i + 1}</legend>
                  {field(`faq.${i}.q`, "Question", f.q, (v) => edit((d) => { d.faq[i].q = v; return d; }), { max: LIMITS.faqQ })}
                  {field(`faq.${i}.a`, "Answer", f.a, (v) => edit((d) => { d.faq[i].a = v; return d; }), { max: LIMITS.faqA, area: true })}
                  <div className="flex gap-3">
                    <Button variant="ghost" disabled={i === 0} onClick={() => edit((d) => { [d.faq[i - 1], d.faq[i]] = [d.faq[i], d.faq[i - 1]]; return d; })}>Move question {i + 1} up</Button>
                    <Button variant="ghost" onClick={() => edit((d) => { d.faq.splice(i, 1); return d; })}>Remove question {i + 1}</Button>
                  </div>
                </fieldset>
              ))}
              <p className="mb-3 text-sm text-muted">Keep the answers about static codes accurate: they cannot be edited after printing.</p>
              <Button variant="secondary" disabled={data.faq.length >= LIMITS.faqMax} onClick={() => edit((d) => { d.faq.push({ q: "", a: "" }); return d; })}>Add a question</Button>
            </>
          )}
          {tab === "footer" && (
            <>
              <p className="mb-4 text-sm text-muted">Only add links to pages that really exist. Do not publish placeholder legal pages. Terms, Privacy and support addresses are managed in Settings.</p>
              {data.footer.links.map((l, i) => (
                <fieldset key={i} className="mb-5 border-b border-divider pb-4">
                  <legend className="mb-2 font-medium">Link {i + 1}</legend>
                  {field(`footer.links.${i}.label`, "Label", l.label, (v) => edit((d) => { d.footer.links[i].label = v; return d; }), { max: LIMITS.linkLabel })}
                  {field(`footer.links.${i}.url`, "Address (https://)", l.url, (v) => edit((d) => { d.footer.links[i].url = v; return d; }), { max: 300 })}
                  <Button variant="ghost" onClick={() => edit((d) => { d.footer.links.splice(i, 1); return d; })}>Remove link {i + 1}</Button>
                </fieldset>
              ))}
              <Button variant="secondary" disabled={data.footer.links.length >= LIMITS.linksMax} onClick={() => edit((d) => { d.footer.links.push({ label: "", url: "https://" }); return d; })}>Add a link</Button>
            </>
          )}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={st.kind === "saving" || !dirty}>{st.kind === "saving" ? "Saving…" : "Save draft"}</Button>
          {canPublish ? (
            <ActionButton endpoint="/api/admin/content" payload={{ action: "publish", version: ver }} label="Publish" variant="primary" confirmLabel="Publish to the website" title="Publish this draft?" effect={<>The saved draft (version {ver}) becomes the live landing page. Draft changes are not live until you do this.</>} disabledReason={dirty ? "Save the draft first." : ver === 0 ? "Save a draft first." : publishedSame ? "The live page already matches this draft." : undefined} />
          ) : (
            <span className="text-sm text-muted">Publishing needs the Owner, or the publish permission.</span>
          )}
          {dirty ? <span className="text-sm text-muted" role="status">Unsaved changes</span> : null}
          {st.kind === "saved" ? <span className="text-sm text-brand" role="status">Draft saved at {st.at} WAT. Not live yet.</span> : null}
        </div>
        {st.kind === "error" ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {st.conflict ? "This record changed. Compare the latest version before saving. Your draft has been kept. " : null}
            {st.message}
            {st.conflict ? <> <button className="font-medium underline" onClick={() => router.refresh()}>Load the latest</button> (this replaces what you see)</> : null}
          </p>
        ) : null}
      </div>
      <aside aria-label="Preview" className="rounded-panel border border-divider p-5">
        <h2 className="mb-1 text-lg font-medium">Preview</h2>
        <p className="mb-4 text-[13px] text-muted">Draft changes are not live. Prices show on the real page.</p>
        <p className="mb-1 text-xl font-semibold">{data.hero.headline || "…"}</p>
        <p className="mb-2 text-muted">{data.hero.support}</p>
        <p className="mb-4"><span className="inline-block rounded-control bg-brand px-4 py-2 text-sm font-medium text-white">{data.hero.cta || "…"}</span></p>
        <p className="mb-6 text-[13px] text-muted">{data.hero.freeNote}</p>
        <UsesBlock uses={data.uses.filter((u) => u.title)} />
        <FaqBlock faq={data.faq.filter((f) => f.q)} />
      </aside>
    </div>
  );
}
