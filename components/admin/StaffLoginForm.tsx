"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";

/** Staff email and password. No Google, no registration. The server decides who may continue; failures are neutral. */
export default function StaffLoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const focus = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busyRef.current) return;
    const errs: typeof errors = {};
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) errs.email = "Enter your email address.";
    if (!password) errs.password = "Enter your password.";
    setErrors(errs);
    if (errs.email) return focus("staff-email");
    if (errs.password) return focus("staff-password");
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/auth/login", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ email: email.trim(), password, next }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; next?: string; error?: string };
      if (res.ok && j.ok) {
        // Full navigation: drops any cached signed-out UI and lets the server render the right step (second factor, setup, or the page).
        window.location.assign(j.next ?? "/admin");
        return;
      }
      setErrors({ form: res.status === 429 ? "Too many attempts. Wait a few minutes and try again." : (j.error ?? "Could not sign in. Try again.") });
      focus("staff-email");
    } catch {
      setErrors({ form: "Could not reach the server. Check your connection and try again." });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      {errors.form ? (
        <p role="alert" className="mb-4 text-sm text-danger">
          {errors.form}
        </p>
      ) : null}
      <TextField id="staff-email" label="Staff email" type="email" autoComplete="username" inputMode="email" value={email} error={errors.email} onChange={(e) => setEmail(e.target.value)} />
      <TextField id="staff-password" label="Password" type={show ? "text" : "password"} autoComplete="current-password" value={password} error={errors.password} onChange={(e) => setPassword(e.target.value)} />
      <div className="-mt-2 mb-6 flex flex-wrap items-center justify-between gap-3">
        <label className="flex min-h-12 items-center gap-3">
          <input type="checkbox" className="size-6" checked={show} onChange={(e) => setShow(e.target.checked)} />
          Show password
        </label>
        <Link href="/admin/login/forgot" className="text-brand underline">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Please wait…" : "Sign in"}
      </Button>
    </form>
  );
}
