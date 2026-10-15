"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { KIND_INFO, BLOCK_KINDS } from "@/lib/pages/blocks";
import type { PageKind } from "@/lib/pages/kinds";

const OPTIONS: { id: PageKind; label: string; blurb: string; hint: string }[] = [
  { id: "card", label: "Digital business card", blurb: "A person’s card with photo, contact details and a Save contact button.", hint: "e.g. Ada – work card" },
  ...BLOCK_KINDS.map((k) => ({ id: k as PageKind, label: KIND_INFO[k].label, blurb: KIND_INFO[k].blurb, hint: KIND_INFO[k].titleHint })),
];

export default function NewCardForm({ initialKind = "card" }: { initialKind?: PageKind }) {
  const router = useRouter();
  const [kind, setKind] = useState<PageKind>(initialKind);
  const [title, setTitle] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const opt = OPTIONS.find((o) => o.id === kind) ?? OPTIONS[0];
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
    <form onSubmit={submit} noValidate className="max-w-[640px]">
      <fieldset className="mb-6 min-w-0 border-0 p-0">
        <legend className="mb-2 text-sm font-medium">What do you want to create?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {OPTIONS.map((o) => (
            <label key={o.id} className={`flex min-h-12 cursor-pointer flex-col gap-1 rounded-control border p-4 ${kind === o.id ? "border-brand bg-soft" : "border-control-border"}`}>
              <span className="flex items-center gap-2 font-medium"><input type="radio" name="kind" className="size-5" checked={kind === o.id} onChange={() => setKind(o.id)} /> {o.label}</span>
              <span className="text-sm text-muted">{o.blurb}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <TextField id="title" label="Page name" value={title} maxLength={80} placeholder={opt.hint} onChange={(e) => setTitle(e.target.value)} help="For your own list. Visitors never see it." error={err && !title.trim() ? err : null} />
      {err && title.trim() ? <p role="alert" className="mb-4 text-sm text-danger">{err}</p> : null}
      <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create page"}</Button>
    </form>
  );
}
