"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";

export default function NewLinkForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [dest, setDest] = useState("");
  const [err, setErr] = useState<{ field?: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, destination: dest }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) { setName(""); setDest(""); setBusy(false); return router.push(`/workspace/links/${j.id}`); }
      setErr({ field: j.field, text: j.error ?? "We couldn’t create the link." });
    } catch { setErr({ text: "We couldn’t reach Qrenuvi. Check your connection and try again." }); }
    setBusy(false);
  }
  return (
    <form onSubmit={submit} noValidate className="mb-8 max-w-[560px] rounded-panel bg-surface p-6">
      <h2 className="mb-4 text-xl font-medium">New dynamic link</h2>
      <TextField id="ln-name" label="Link name" value={name} maxLength={80} placeholder="e.g. Spring menu" onChange={(e) => setName(e.target.value)} help="For your own list. Visitors never see it." error={err?.field === "name" ? err.text : null} />
      <TextField id="ln-dest" label="Where should it go?" value={dest} inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="example.com/menu" onChange={(e) => setDest(e.target.value)} help="You can change this later without reprinting the QR code." error={err?.field === "destination" ? err.text : null} />
      {err && err.field !== "name" && err.field !== "destination" ? <p role="alert" className="mb-4 text-sm text-danger">{err.text}</p> : null}
      <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create link"}</Button>
    </form>
  );
}
