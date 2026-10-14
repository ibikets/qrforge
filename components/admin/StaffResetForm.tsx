"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";

/** Sets the staff password from a recovery link, then sends the person to the staff sign-in. */
export default function StaffResetForm() {
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const [errs, setErrs] = useState<{ pw?: string; again?: string; form?: string }>({});
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const focus = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busyRef.current) return;
    const next: typeof errs = {};
    if (pw.length < 12) next.pw = "Use at least 12 characters. A few random words work well.";
    else if (pw !== again) next.again = "The two passwords do not match.";
    setErrs(next);
    if (next.pw) return focus("staff-new-password");
    if (next.again) return focus("staff-new-password-again");
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/auth/password", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ password: pw }) });
      const j = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (res.ok) {
        window.location.assign("/admin/login?reset=1");
        return;
      }
      if (j.code === "expired" || res.status === 401) setExpired(true);
      else {
        setErrs({ pw: j.error ?? "Could not set the password." });
        focus("staff-new-password");
      }
    } catch {
      setErrs({ form: "Could not reach the server. Check your connection and try again." });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  if (expired)
    return (
      <>
        <p role="alert" className="mb-4 text-danger">This link has expired or was opened in a different browser.</p>
        <Link href="/admin/login/forgot" className="font-medium text-brand">Ask for a new link</Link>
      </>
    );
  return (
    <form onSubmit={submit} noValidate>
      {errs.form ? <p role="alert" className="mb-4 text-sm text-danger">{errs.form}</p> : null}
      <TextField id="staff-new-password" label="New password" type={show ? "text" : "password"} autoComplete="new-password" value={pw} error={errs.pw} help="At least 12 characters." onChange={(e) => setPw(e.target.value)} />
      <TextField id="staff-new-password-again" label="Repeat the password" type={show ? "text" : "password"} autoComplete="new-password" value={again} error={errs.again} onChange={(e) => setAgain(e.target.value)} />
      <label className="-mt-2 mb-6 flex min-h-12 items-center gap-3">
        <input type="checkbox" className="size-6" checked={show} onChange={(e) => setShow(e.target.checked)} />
        Show passwords
      </label>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Please wait…" : "Set password"}
      </Button>
    </form>
  );
}
