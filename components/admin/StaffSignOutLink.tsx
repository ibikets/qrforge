"use client";
import { useState } from "react";

/** Ends the staff session (only) and returns to the staff sign-in. */
export default function StaffSignOutLink() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className="mt-6 block min-h-12 font-medium text-brand underline disabled:text-muted"
      onClick={async () => {
        setBusy(true);
        await fetch("/api/admin/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
        window.location.assign("/admin/login");
      }}
    >
      {busy ? "Signing out…" : "Sign out of staff access"}
    </button>
  );
}
