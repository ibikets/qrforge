"use client";
import { useState } from "react";

/** Native share sheet where the browser has one; otherwise copies the link. States are announced. */
export default function ShareButton({ title, className }: { title: string; className: string }) {
  const [msg, setMsg] = useState("");
  async function share() {
    const url = window.location.href.split("#")[0];
    try {
      if (navigator.share) { await navigator.share({ title, url }); return; }
      await navigator.clipboard.writeText(url);
      setMsg("Link copied");
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      setMsg("Copy this page's address from your browser bar");
    }
    setTimeout(() => setMsg(""), 4000);
  }
  return (
    <>
      <button type="button" onClick={share} className={className}>Share</button>
      <span role="status" className="sr-only">{msg}</span>
      {msg ? <span aria-hidden="true" className="col-span-full text-center text-sm">{msg}</span> : null}
    </>
  );
}
