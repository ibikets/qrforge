"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";

/** Asks for a password link. The answer is the same whoever types what, so it cannot be used to find out who is staff. */
export default function StaffRecoverForm() {
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busyRef.current) return;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setErr("Enter your email address.");
      document.getElementById("staff-recover-email")?.focus();
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/auth/recover", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ email: email.trim() }) });
      if (res.status === 429) setErr("Too many requests. Wait a while and try again.");
      else if (res.ok) setDone(true);
      else setErr("Could not send the request. Try again.");
    } catch {
      setErr("Could not reach the server. Check your connection and try again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  if (done)
    return (
      <>
        <Notice live title="Check your email">
          If that address has management access, a link to set a password is on its way. Open it in this same browser. It expires soon.
        </Notice>
        <Link href="/admin/login" className="font-medium text-brand">
          Back to staff sign-in
        </Link>
      </>
    );
  return (
    <form onSubmit={submit} noValidate>
      <TextField id="staff-recover-email" label="Staff email" type="email" autoComplete="username" inputMode="email" value={email} error={err} onChange={(e) => setEmail(e.target.value)} />
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Please wait…" : "Send link"}
      </Button>
      <p className="mt-6">
        <Link href="/admin/login" className="font-medium text-brand">
          Back to staff sign-in
        </Link>
      </p>
    </form>
  );
}
