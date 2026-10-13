"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";

export default function ConfirmEmail() {
  const [email, setEmail] = useState<string | null>(null);
  const [cool, setCool] = useState(60);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setEmail(sessionStorage.getItem("qrf:pending-email"));
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (cool <= 0) return;
    const t = setTimeout(() => setCool((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cool]);

  async function resend() {
    if (!email || busyRef.current || cool > 0) return;
    busyRef.current = true;
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabaseBrowser().auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/create")}` },
      });
      if (error) setMsg({ kind: "error", text: "We couldn’t send another email right now. Wait a minute and try again." });
      else setMsg({ kind: "ok", text: "We asked for another email. It can take a few minutes." });
      setCool(60);
    } catch {
      setMsg({ kind: "error", text: "We couldn’t send the request. Check your connection and try again." });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <Notice title="Check your inbox">
        {email ? <>We sent a confirmation link to {email} if that address can receive it.</> : <>We sent a confirmation link to the address you used. Open it in this browser to finish creating your account.</>}
      </Notice>
      <div role="status" aria-live="polite" className="mb-4 min-h-6 text-sm">
        {msg ? <p className={msg.kind === "error" ? "text-danger" : ""}>{msg.text}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {email ? (
          <Button variant="secondary" onClick={resend} disabled={cool > 0 || busy}>
            {cool > 0 ? `Resend email in ${cool}s` : busy ? "Sending…" : "Resend email"}
          </Button>
        ) : null}
        <Link href="/login" className="inline-flex min-h-12 items-center text-brand underline">
          Back to sign in
        </Link>
      </div>
    </>
  );
}
