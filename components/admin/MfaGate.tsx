"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { controlClass } from "@/components/ui/Field";
import { staffBrowser } from "@/lib/staff-auth";
import StaffSignOutLink from "@/components/admin/StaffSignOutLink";

type Mode = { kind: "loading" } | { kind: "verify"; factorId: string } | { kind: "enroll"; factorId: string; qr: string; secret: string } | { kind: "error"; message: string };

/** Second factor (TOTP). Staff sessions without it cannot reach any management data or action. */
export default function MfaGate() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const sb = staffBrowser();
      const { data, error } = await sb.auth.mfa.listFactors();
      if (error) return setMode({ kind: "error", message: "Could not check your second factor. Reload to try again." });
      const verified = data.totp.find((f) => f.status === "verified");
      if (verified) return setMode({ kind: "verify", factorId: verified.id });
      // clear unfinished enrolments so a fresh QR can be created
      for (const f of data.all.filter((x) => x.status === "unverified")) await sb.auth.mfa.unenroll({ factorId: f.id });
      const en = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Qrenuvi staff" });
      if (en.error || !en.data) return setMode({ kind: "error", message: "Could not start setup. Multi-factor sign-in may not be enabled for this project." });
      setMode({ kind: "enroll", factorId: en.data.id, qr: en.data.totp.qr_code, secret: en.data.totp.secret });
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode.kind !== "verify" && mode.kind !== "enroll") return;
    if (!/^\d{6}$/.test(code.trim())) {
      setMsg("Enter the 6-digit code from your authenticator app.");
      document.getElementById("mfa-code")?.focus();
      return;
    }
    setBusy(true);
    setMsg(null);
    const { error } = await staffBrowser().auth.mfa.challengeAndVerify({ factorId: mode.factorId, code: code.trim() });
    setBusy(false);
    if (error) {
      setMsg("That code was not accepted. Check the code and your phone’s clock, then try again.");
      document.getElementById("mfa-code")?.focus();
      return;
    }
    router.refresh();
  }

  return (
    <div className="mx-auto my-12 max-w-[460px] px-5">
      <h1 className="mb-2 text-[28px] font-semibold">Confirm it’s you</h1>
      {mode.kind === "loading" ? <p className="text-muted">Checking your second factor…</p> : null}
      {mode.kind === "error" ? <p role="alert" className="text-danger">{mode.message}</p> : null}
      {mode.kind === "enroll" ? (
        <div className="mb-4">
          <p className="mb-3 text-muted">Management needs a second step. Scan this code with an authenticator app, then enter the 6-digit code it shows.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mode.qr} alt="Authenticator setup code" width={192} height={192} className="mb-3 block bg-white p-2" />
          <p className="text-[13px] text-muted">Cannot scan? Enter this key in the app: <code className="break-all font-mono">{mode.secret}</code></p>
        </div>
      ) : null}
      {mode.kind === "verify" ? <p className="mb-4 text-muted">Enter the 6-digit code from your authenticator app to open management.</p> : null}
      {mode.kind === "verify" || mode.kind === "enroll" ? (
        <form onSubmit={submit} noValidate>
          <label htmlFor="mfa-code" className="mb-2 block text-sm font-medium">6-digit code</label>
          <input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className={controlClass} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} aria-invalid={msg ? true : undefined} aria-describedby={msg ? "mfa-err" : undefined} />
          {msg ? <p id="mfa-err" role="alert" className="mt-2 text-[13px] text-danger">{msg}</p> : null}
          <Button type="submit" className="mt-5 w-full" disabled={busy}>{busy ? "Checking…" : mode.kind === "enroll" ? "Turn on and continue" : "Continue"}</Button>
        </form>
      ) : null}
      <StaffSignOutLink />
    </div>
  );
}
