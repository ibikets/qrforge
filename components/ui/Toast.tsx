"use client";
import { useEffect } from "react";

/** Polite live region; the region stays mounted so screen readers announce changes. */
export default function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 6000);
    return () => clearTimeout(t);
  }, [message, onDone]);
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-5">
      {message ? (
        <div className="pointer-events-auto rounded-panel border border-divider bg-soft px-6 py-4 text-sm shadow-sm">{message}</div>
      ) : null}
    </div>
  );
}
