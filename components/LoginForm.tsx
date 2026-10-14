"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";

const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
    <path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
  </svg>
);

export default function LoginForm({
  next,
  initialMode,
  notice,
}: {
  next: string;
  initialMode: "in" | "up";
  notice: "auth-error" | "reset-done" | "timeout" | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">(initialMode);
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
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) errs.email = "Enter a valid email address.";
    if (!password) errs.password = "Enter your password.";
    else if (mode === "up" && password.length < 8) errs.password = "Use at least 8 characters.";
    setErrors(errs);
    if (errs.email) return focus("email");
    if (errs.password) return focus("password");

    busyRef.current = true;
    setBusy(true);
    try {
      const sb = supabaseBrowser();
      if (mode === "in") {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (error) {
          setErrors({ form: "That email and password don’t match. Check them and try again." });
          return focus("email");
        }
      } else {
        const { error, data } = await sb.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
        });
        if (error) {
          setErrors({ form: error.message });
          return focus("email");
        }
        if (!data.session) {
          try {
            sessionStorage.setItem("qrf:pending-email", email.trim());
          } catch {}
          router.push("/confirm-email");
          return;
        }
      }
      router.push(next);
      router.refresh();
    } catch {
      setErrors({ form: "We couldn’t reach the sign-in service. Check your connection and try again." });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function google() {
    setErrors({});
    try {
      const { error } = await supabaseBrowser().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      if (error) setErrors({ form: "We couldn’t start Google sign-in. Try again or use email." });
    } catch {
      setErrors({ form: "We couldn’t start Google sign-in. Try again or use email." });
    }
  }

  return (
    <>
      {notice === "auth-error" ? (
        <Notice tone="error" live title="We couldn’t complete sign-in">
          The link may have expired or was opened in a different browser. Try signing in again.
        </Notice>
      ) : null}
      {notice === "timeout" ? (
        <Notice live title="You were signed out">
          For your security, we sign you out after 20 minutes of inactivity. Sign in to continue.
        </Notice>
      ) : null}
      {notice === "reset-done" ? (
        <Notice live title="Password updated">
          Sign in with your new password.
        </Notice>
      ) : null}

      <Button variant="secondary" className="w-full" onClick={google}>
        <GoogleMark />
        Continue with Google
      </Button>
      <div className="my-6 flex items-center gap-3 text-sm text-muted">
        <span className="h-px flex-1 bg-divider" />
        or use email
        <span className="h-px flex-1 bg-divider" />
      </div>

      <form onSubmit={submit} noValidate>
        {errors.form ? (
          <p role="alert" className="mb-4 text-sm text-danger">
            {errors.form}
          </p>
        ) : null}
        <TextField id="email" label="Email" type="email" autoComplete="email" inputMode="email" value={email} error={errors.email} onChange={(e) => setEmail(e.target.value)} />
        <TextField
          id="password"
          label="Password"
          type={show ? "text" : "password"}
          autoComplete={mode === "in" ? "current-password" : "new-password"}
          value={password}
          error={errors.password}
          help={mode === "up" ? "At least 8 characters." : undefined}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="-mt-2 mb-6 flex flex-wrap items-center justify-between gap-3">
          <label className="flex min-h-12 items-center gap-3">
            <input type="checkbox" className="size-6" checked={show} onChange={(e) => setShow(e.target.checked)} />
            Show password
          </label>
          {mode === "in" ? (
            <Link href="/forgot-password" className="text-brand underline">
              Forgot password?
            </Link>
          ) : null}
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-muted">
        {mode === "in" ? "New here? " : "Already have an account? "}
        <button
          type="button"
          className="min-h-12 text-brand underline"
          onClick={() => {
            setMode(mode === "in" ? "up" : "in");
            setErrors({});
          }}
        >
          {mode === "in" ? "Create an account" : "Sign in"}
        </button>
      </p>
    </>
  );
}
