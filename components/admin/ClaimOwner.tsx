"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

export default function ClaimOwner() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="mt-6">
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          const res = await fetch("/api/admin/bootstrap", { method: "POST", credentials: "same-origin" }).catch(() => null);
          setBusy(false);
          if (res?.ok) router.refresh();
          else setErr(((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? "Could not set up the Owner. Try again.");
        }}
      >
        {busy ? "Setting up…" : "Set up the Owner account"}
      </Button>
      {err ? <p role="alert" className="mt-3 text-sm text-danger">{err}</p> : null}
    </div>
  );
}
