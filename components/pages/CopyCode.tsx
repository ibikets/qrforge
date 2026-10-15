"use client";
import { useState } from "react";
import { LuCheck, LuCopy } from "react-icons/lu";

/** The offer code in plain text with a Copy button. Display only: nothing is sent anywhere. */
export default function CopyCode({ code }: { code: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(code); setDone(true); setTimeout(() => setDone(false), 2000); } catch { setDone(false); }
  }
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <span className="text-sm">Code</span>
      <code className="rounded-control border border-dashed border-[var(--qc-accent)] bg-white px-3 py-2 font-mono text-base font-semibold tracking-wide">{code}</code>
      <button type="button" onClick={copy} className="inline-flex min-h-11 items-center gap-2 rounded-control border border-[var(--qc-line)] bg-white px-4 text-sm text-ink hover:bg-[var(--qc-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--qc-accent)]">
        {done ? <LuCheck aria-hidden="true" size={18} /> : <LuCopy aria-hidden="true" size={18} />} {done ? "Copied" : "Copy code"}
      </button>
      <span role="status" aria-live="polite" className="sr-only">{done ? "Code copied" : ""}</span>
    </div>
  );
}
