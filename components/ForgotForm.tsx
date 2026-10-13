"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";

export default function ForgotForm() {
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cool, setCool] = useState(0);
  const busyRef = useRef(false);

  useEffect(() => {
    if (cool <= 0) return;
    const t = setTimeout(() => setCool((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cool]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busyRef.current || cool > 0) return;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setErr("Enter a valid email address.");
      return document.getElementById("email")?.focus();
    }
    setErr(null);
    busyRef.current = true;
    setBusy(true);
    try {
      const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
      });
      // Same neutral response whether or not the account exists; only transport/rate-limit errors are shown.
      if (error && (error.status === 429 || /rate|seconds/i.test(error.message))) {
        setErr("Too many requests. Wait a minute and try again.");
        setCool(60);
        return;
      }
      setSent(true);
      setCool(60);
    } catch {
      setErr("We couldn’t send the request. Check your connection and try again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return sent ? (
    <>
      <Notice live title="Check your inbox">
        If an account exists for that address, we sent a reset link. It can take a few minutes.
      </Notice>
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" disabled={cool > 0 || busy} onClick={submit}>
          {cool > 0 ? `Send again in ${cool}s` : "Send again"}
        </Button>
        <Link href="/login" className="inline-flex min-h-12 items-center text-brand underline">
          Back to sign in
        </Link>
      </div>
    </>
  ) : (
    <form onSubmit={submit} noValidate>
      <TextField id="email" label="Email" type="email" autoComplete="email" inputMode="email" value={email} error={err} onChange={(e) => setEmail(e.target.value)} />
      <Button type="submit" className="w-full" disabled={busy || cool > 0}>
        {busy ? "Sending…" : cool > 0 ? `Try again in ${cool}s` : "Send reset link"}
      </Button>
      <p className="mt-6">
        <Link href="/login" className="text-brand underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
