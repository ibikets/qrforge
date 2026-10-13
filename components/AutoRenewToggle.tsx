"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AutoRenewToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    await fetch("/api/billing/auto-renew", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !enabled }),
    });
    setBusy(false);
    router.refresh();
  }
  return (
    <button
      onClick={toggle}
      disabled={busy}
      className="rounded-lg border border-neutral-900 px-4 py-2 text-sm font-medium hover:bg-neutral-900 hover:text-white disabled:opacity-60"
    >
      {busy ? "Saving…" : enabled ? "Turn off auto-renewal" : "Turn on auto-renewal"}
    </button>
  );
}
