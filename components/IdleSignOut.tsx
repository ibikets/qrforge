"use client";
import { useEffect, useRef, useState } from "react";
import Dialog from "@/components/ui/Dialog";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { IDLE_MS, WARN_MS } from "@/lib/session-policy";

const KEY = "qrf:last-active"; // shared across tabs so activity in one tab keeps the others signed in
const PING_EVERY_MS = 60 * 1000;
const EVENTS = ["pointerdown", "keydown", "scroll", "touchstart"] as const;

const read = () => {
  try {
    return Number(localStorage.getItem(KEY)) || Date.now();
  } catch {
    return Date.now();
  }
};

/** Signs the user out after IDLE_MS without activity. The server enforces the same limit (proxy.ts); this adds the warning and handles idle open tabs. */
export default function IdleSignOut() {
  const [warn, setWarn] = useState(false);
  const lastPing = useRef(0);
  const leaving = useRef(false);

  useEffect(() => {
    const mark = () => {
      const now = Date.now();
      try {
        localStorage.setItem(KEY, String(now));
      } catch {}
      if (now - lastPing.current > PING_EVERY_MS) {
        lastPing.current = now;
        fetch("/api/session", { method: "POST", credentials: "same-origin" }).catch(() => {});
      }
    };
    const onActivity = () => {
      setWarn(false);
      mark();
    };
    async function leave() {
      if (leaving.current) return;
      leaving.current = true;
      try {
        await supabaseBrowser().auth.signOut({ scope: "local" });
      } catch {}
      // Full navigation on purpose: drops all cached signed-in UI state.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login?timeout=1");
    }
    const check = () => {
      const idle = Date.now() - read();
      if (idle >= IDLE_MS) void leave();
      else setWarn(idle >= IDLE_MS - WARN_MS);
    };
    mark();
    EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    document.addEventListener("visibilitychange", check);
    const id = window.setInterval(check, 5000);
    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener("visibilitychange", check);
      window.clearInterval(id);
    };
  }, []);

  // The warning is modal, so pointer/key activity inside it is a deliberate "stay signed in".
  return (
    <Dialog open={warn} onClose={() => setWarn(false)} title="Still there?">
      <p className="mb-4 text-muted">You will be signed out in about a minute because of inactivity.</p>
      <button type="button" className="min-h-12 w-full rounded-control bg-brand px-4 font-medium text-white" onClick={() => setWarn(false)}>
        Stay signed in
      </button>
    </Dialog>
  );
}
