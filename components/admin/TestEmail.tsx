"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

const MEANING: Record<string, string> = {
  delivered: "Delivered: the receiving mail server accepted it. Check the inbox (and spam) of qrenuvi@bitzpark.com to confirm it arrived.",
  sent: "Accepted by the email service and handed on. Not confirmed as delivered yet. Refresh in a few seconds.",
  queued: "Accepted by the email service and waiting to go out. Refresh in a few seconds.",
  scheduled: "Accepted by the email service and waiting to go out. Refresh in a few seconds.",
  delivery_delayed: "Delayed: the receiving server did not take it yet. The service keeps retrying.",
  bounced: "Bounced: the receiving server refused it. The mailbox or alias for qrenuvi@bitzpark.com may not exist or may not accept mail.",
  complained: "Marked as spam by the recipient.",
  suppressed: "Not sent: the address is on the email service's suppression list.",
  canceled: "Cancelled by the email service.",
  unknown: "Accepted by the email service, but its current status could not be read (the key may be send-only). Check the Resend dashboard or the inbox.",
};
type R = { kind: "idle" } | { kind: "busy" } | { kind: "ok"; id: string; event: string } | { kind: "err"; text: string };

async function post(body: unknown) {
  try {
    const r = await fetch("/api/admin/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
    return { ok: r.ok, json: (await r.json().catch(() => ({}))) as Record<string, unknown> };
  } catch { return { ok: false, json: { error: "Could not reach the server. Nothing was confirmed." } as Record<string, unknown> }; }
}

/** Sends one labelled test message to the support address through the real sender, then reports what the email service says, not just "accepted". */
export default function TestEmail() {
  const [s, setS] = useState<R>({ kind: "idle" });
  async function send() {
    setS({ kind: "busy" });
    const r = await post({ action: "send_test_email" });
    setS(r.ok ? { kind: "ok", id: String(r.json.id), event: String(r.json.lastEvent ?? "unknown") } : { kind: "err", text: String(r.json.error ?? "The test could not be sent.") });
  }
  async function refresh(id: string) {
    const r = await post({ action: "test_email_status", id });
    setS(r.ok ? { kind: "ok", id, event: String(r.json.lastEvent ?? "unknown") } : { kind: "err", text: String(r.json.error ?? "No status returned.") });
  }
  return (
    <div className="mt-6">
      <h3 className="mb-2 font-medium">Test support email</h3>
      <p className="mb-3 text-sm text-muted">Sends one message labelled “[Qrenuvi TEST]” from Qrenuvi Support to qrenuvi@bitzpark.com only. No customer or ticket is touched.</p>
      <Button variant="secondary" onClick={send} disabled={s.kind === "busy"}>{s.kind === "busy" ? "Sending…" : "Send test email to qrenuvi@bitzpark.com"}</Button>
      <div role="status" aria-live="polite" className="mt-3 text-sm">
        {s.kind === "ok" ? (
          <>
            <p>Result: <strong>{s.event}</strong>. {MEANING[s.event] ?? MEANING.unknown}</p>
            <p className="text-muted">Message id {s.id}. This confirms sending only; receiving and replies need separate confirmation.</p>
            <Button variant="ghost" onClick={() => refresh(s.id)}>Refresh status</Button>
          </>
        ) : null}
        {s.kind === "err" ? <p role="alert" className="text-danger">{s.text}</p> : null}
      </div>
    </div>
  );
}
