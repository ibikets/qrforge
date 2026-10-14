"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

type Result = { checked?: boolean; message?: string; matches?: boolean; provider?: { status: string; amount: number; currency: string }; recorded?: { amount_kobo: number; status: string }; error?: string };

export default function ReconcileButton({ reference }: { reference: string }) {
  const [r, setR] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/payments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reconcile", reference }), credentials: "same-origin" });
      setR((await res.json().catch(() => ({ error: "Unexpected response." }))) as Result);
    } catch {
      setR({ error: "Could not reach the server." });
    }
    setBusy(false);
  }
  const ngn = (k: number) => `₦${(k / 100).toLocaleString("en-US")}`;
  return (
    <div>
      <Button variant="secondary" onClick={run} disabled={busy}>{busy ? "Checking…" : "Check with the payment provider"}</Button>
      <div role="status" aria-live="polite" className="mt-3 text-sm">
        {r?.error ? <p className="text-danger">{r.error}</p> : null}
        {r && !r.error && r.checked === false ? <p className="text-warning">{r.message}</p> : null}
        {r?.checked ? (
          <p className={r.matches ? "text-brand" : "text-danger"}>
            {r.matches ? "Matches." : "Does not match."} Provider: {r.provider?.status}, {ngn(r.provider!.amount)} {r.provider?.currency}. Our record: {r.recorded?.status}, {ngn(r.recorded!.amount_kobo)}. Nothing was changed.
          </p>
        ) : null}
      </div>
    </div>
  );
}
