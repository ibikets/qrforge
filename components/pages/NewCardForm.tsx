"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";

export default function NewCardForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) return router.push(`/workspace/pages/${j.id}`);
      setErr(j.error ?? "We couldn’t create the card.");
    } catch { setErr("We couldn’t reach Qrenuvi. Check your connection and try again."); }
    setBusy(false);
  }
  return (
    <form onSubmit={submit} noValidate className="max-w-[480px]">
      <TextField id="title" label="Card name" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} help="For your own list, e.g. “Ada – work card”. Recipients never see it." error={err && !title.trim() ? err : null} />
      {err ? <p role="alert" className="mb-4 text-sm text-danger">{err}</p> : null}
      <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create card"}</Button>
    </form>
  );
}
