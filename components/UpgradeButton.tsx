"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PlanId } from "@/lib/plans";

export default function UpgradeButton({
  plan,
  signedIn,
  isCurrent,
  autoRenew,
}: {
  plan: PlanId;
  signedIn: boolean;
  isCurrent: boolean;
  autoRenew: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function go() {
    if (!signedIn) return router.push("/login?next=/pricing");
    setBusy(true);
    setErr("");
    const res = await fetch("/api/paystack/initialize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, autoRenew }),
    });
    const json = await res.json();
    if (json.url) window.location.href = json.url;
    else {
      setErr(json.error ?? "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={go}
        disabled={busy}
        className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
      >
        {busy ? "Redirecting…" : isCurrent ? "Extend by 30 days" : "Upgrade"}
      </button>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
    </>
  );
}
