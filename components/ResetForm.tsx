"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Button, LinkButton } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";

export default function ResetForm({ expiredHint }: { expiredHint: boolean }) {
  const router = useRouter();
  const [ready, setReady] = useState<"checking" | "ok" | "expired">(expiredHint ? "expired" : "checking");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [errs, setErrs] = useState<{ pw?: string; pw2?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    if (expiredHint) return;
    let live = true;
    supabaseBrowser()
      .auth.getUser()
      .then(({ data }) => live && setReady(data.user ? "ok" : "expired"))
      .catch(() => live && setReady("expired"));
    return () => {
      live = false;
    };
  }, [expiredHint]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busyRef.current) return;
    const x: typeof errs = {};
    if (pw.length < 8) x.pw = "Use at least 8 characters.";
    if (pw2 !== pw) x.pw2 = "The passwords don’t match.";
    setErrs(x);
    if (x.pw) return document.getElementById("pw")?.focus();
    if (x.pw2) return document.getElementById("pw2")?.focus();
    busyRef.current = true;
    setBusy(true);
    try {
      const sb = supabaseBrowser();
      const { error } = await sb.auth.updateUser({ password: pw });
      if (error) {
        setErrs({ form: /same|different/i.test(error.message) ? "Choose a password you haven’t used before." : "We couldn’t save your new password. Request a new link and try again." });
        return;
      }
      await sb.auth.signOut();
      router.push("/login?reset=1");
    } catch {
      setErrs({ form: "We couldn’t reach the service. Check your connection and try again." });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  if (ready === "checking") return <p role="status" className="text-muted">Checking your link…</p>;
  if (ready === "expired")
    return (
      <>
        <Notice tone="warning" live title="This reset link has expired">
          Request a new link to reset your password.
        </Notice>
        <LinkButton href="/forgot-password">Send a new link</LinkButton>
        <p className="mt-6">
          <Link href="/login" className="text-brand underline">Back to sign in</Link>
        </p>
      </>
    );
  return (
    <form onSubmit={submit} noValidate>
      {errs.form ? <p role="alert" className="mb-4 text-sm text-danger">{errs.form}</p> : null}
      <TextField id="pw" label="New password" type={show ? "text" : "password"} autoComplete="new-password" value={pw} error={errs.pw} help="At least 8 characters." onChange={(e) => setPw(e.target.value)} />
      <TextField id="pw2" label="Confirm new password" type={show ? "text" : "password"} autoComplete="new-password" value={pw2} error={errs.pw2} onChange={(e) => setPw2(e.target.value)} />
      <label className="-mt-2 mb-6 flex min-h-12 items-center gap-3">
        <input type="checkbox" className="size-6" checked={show} onChange={(e) => setShow(e.target.checked)} />
        Show passwords
      </label>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}
