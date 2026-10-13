"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export default function AutoRenewToggle({ enabled, canEnable }: { enabled: boolean; canEnable: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const busyRef = useRef(false);

  async function toggle() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/billing/auto-renew", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(res.status === 409 ? (j.error ?? "Pay by card to enable auto-renewal.") : "We couldn’t update auto-renewal. Your previous preference is unchanged. Try again.");
        return;
      }
      router.refresh(); // the page re-reads the committed value; nothing is shown as changed before this
    } catch {
      setErr("We couldn’t update auto-renewal. Your previous preference is unchanged. Check your connection and try again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div>
      <Button variant="secondary" onClick={toggle} disabled={busy || (!enabled && !canEnable)}>
        {busy ? "Saving…" : enabled ? "Turn off auto-renewal" : "Turn on auto-renewal"}
      </Button>
      {!enabled && !canEnable ? <p className="mt-2 text-sm text-muted">Pay by card to enable auto-renewal.</p> : null}
      {err ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {err}
        </p>
      ) : null}
    </div>
  );
}
