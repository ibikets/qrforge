"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PLANS, type PlanId } from "@/lib/plans";
import { Button } from "@/components/ui/Button";

export default function UpgradeButton({
  plan,
  signedIn,
  isCurrent,
  included,
  autoRenew,
}: {
  plan: PlanId;
  signedIn: boolean;
  isCurrent: boolean;
  /** a higher active plan already includes this one */
  included: boolean;
  autoRenew: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const busyRef = useRef(false);

  if (included)
    return <p className="text-sm text-muted">Included in your current plan.</p>;

  async function go() {
    if (busyRef.current) return;
    if (!signedIn) return router.push("/login?next=%2Fpricing");
    busyRef.current = true;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/paystack/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, autoRenew }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) return router.push("/login?next=%2Fpricing");
      if (json.url) {
        window.location.href = json.url; // full-page Paystack redirect; stay "busy" while the browser leaves
        return;
      }
      setErr(json.error ?? "We couldn’t start checkout. Nothing was charged. Try again.");
    } catch {
      setErr("We couldn’t reach checkout. Nothing was charged. Check your connection and try again.");
    }
    busyRef.current = false;
    setBusy(false);
  }

  const label = isCurrent ? "Extend by 30 days" : `Choose ${PLANS[plan].name}`;
  return (
    <>
      <Button className="w-full" onClick={go} disabled={busy}>
        {busy ? "Opening checkout…" : !signedIn ? `Sign in to choose ${PLANS[plan].name}` : label}
      </Button>
      {err ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {err}
        </p>
      ) : null}
    </>
  );
}
