"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { KIND_GROUPS, KIND_ICON } from "@/components/pages/kind-ui";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { KIND_INFO } from "@/lib/pages/blocks";
import { isPageKind, kindLabel, type PageKind } from "@/lib/pages/kinds";

const CARD = { blurb: "A person’s card with photo, contact details and a Save contact button.", hint: "e.g. Ada – work card", notice: undefined as string | undefined };
const about = (k: PageKind) => (k === "card" ? CARD : { blurb: KIND_INFO[k].blurb, hint: KIND_INFO[k].titleHint, notice: KIND_INFO[k].notice });

export default function NewCardForm({ initialKind = "card" }: { initialKind?: PageKind }) {
  const router = useRouter();
  const [kind, setKind] = useState<PageKind>(isPageKind(initialKind) ? initialKind : "card");
  const [title, setTitle] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const info = about(kind);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, kind }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        // Leave this form clean: the route can be kept alive in the background, and "New page" must open empty.
        setTitle(""); setKind("card"); setBusy(false);
        return router.push(`/workspace/pages/${j.id}`);
      }
      setErr(j.error ?? "We couldn’t create the page.");
    } catch { setErr("We couldn’t reach Qrenuvi. Check your connection and try again."); }
    setBusy(false);
  }
  return (
    <form onSubmit={submit} noValidate className="max-w-[720px]">
      <fieldset className="mb-4 min-w-0 border-0 p-0">
        <legend className="mb-3 text-sm font-medium">What do you want to create?</legend>
        {KIND_GROUPS.map((g) => (
          <div key={g.id} role="group" aria-labelledby={`kg-${g.id}`} className="mb-4">
            <p id={`kg-${g.id}`} className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">{g.title}</p>
            <div className="grid grid-cols-2 gap-2 min-[480px]:grid-cols-3 min-[720px]:grid-cols-4">
              {g.kinds.map((k) => {
                const Icon = KIND_ICON[k];
                const on = kind === k;
                return (
                  <label key={k} className={`relative flex min-h-[72px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-control border px-2 py-3 text-center has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand ${on ? "border-brand bg-soft" : "border-control-border hover:bg-soft"}`}>
                    <input type="radio" name="kind" value={k} className="absolute inset-0 size-full cursor-pointer opacity-0" checked={on} onChange={() => setKind(k)} aria-describedby="kind-about" />
                    <Icon aria-hidden="true" size={28} className={on ? "text-brand" : "text-ink"} />
                    <span className="text-sm font-medium leading-tight">{kindLabel(k)}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
        <div id="kind-about" aria-live="polite" className="rounded-control bg-soft p-3 text-sm">
          <p><span className="font-medium">{kindLabel(kind)}.</span> {info.blurb}</p>
          {info.notice ? <p className="mt-1 text-muted">{info.notice}</p> : null}
        </div>
      </fieldset>
      <TextField id="title" label="Page name" value={title} maxLength={80} placeholder={info.hint} onChange={(e) => setTitle(e.target.value)} help="For your own list. Visitors never see it." error={err && !title.trim() ? err : null} />
      {err && title.trim() ? <p role="alert" className="mb-4 text-sm text-danger">{err}</p> : null}
      <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create page"}</Button>
    </form>
  );
}
