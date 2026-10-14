"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

const HELP: Record<string, string> = {
  invalid: "This invitation is not valid. Ask the Owner to send a new staff invitation.",
  revoked: "This invitation was cancelled. Ask the Owner to send a new staff invitation.",
  used: "This invitation has already been used.",
  expired: "This invitation has expired. Ask the Owner to send a new staff invitation.",
  wrong_account: "Sign in with the email address the invitation was sent to, then open the link again.",
};

export default function AcceptInvite({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function accept() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/invite/accept", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }), credentials: "same-origin" });
      const j = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (res.ok) { router.push("/admin"); return; }
      setMsg((j.code && HELP[j.code]) || j.error || "Could not accept the invitation.");
    } catch {
      setMsg("Could not reach the server. Nothing was changed.");
    }
    setBusy(false);
  }
  return (
    <>
      <p className="mb-5 text-muted">You are signed in as <strong className="text-ink">{email}</strong>. Accepting gives this account the staff role the Owner chose. You will then set up a second sign-in step.</p>
      <Button onClick={accept} disabled={busy}>{busy ? "Accepting…" : "Accept invitation"}</Button>
      {msg ? <p role="alert" className="mt-4 text-sm text-danger">{msg}</p> : null}
    </>
  );
}
