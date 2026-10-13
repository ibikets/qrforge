"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function SignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <span>
      <button
        type="button"
        disabled={busy}
        className="min-h-11 text-sm font-medium text-brand underline underline-offset-2 disabled:text-muted"
        onClick={async () => {
          setBusy(true);
          setFailed(false);
          try {
            const { error } = await supabaseBrowser().auth.signOut();
            if (error) throw error;
            router.push("/");
            router.refresh();
          } catch {
            setFailed(true);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
      {failed ? <span role="alert" className="block text-[13px] text-danger">Could not sign out. Try again.</span> : null}
    </span>
  );
}
