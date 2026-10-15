"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { FaWhatsapp } from "react-icons/fa6";
import { LuGlobe, LuMail, LuPhone, LuShare2, LuUserPlus } from "react-icons/lu";
import { FOCUS, toneStyle, type Tone } from "@/components/pages/card-theme";

export type ActionRow = { id: string; label: string; text: string; href: string; whatsapp?: string | null };
type Key = "call" | "whatsapp" | "email" | "website";
const safe = (h: unknown): h is string => typeof h === "string" && /^(https?:\/\/|tel:|mailto:)/i.test(h);
const ext = (h: string) => (/^https?:\/\//i.test(h) ? { rel: "noopener noreferrer", target: "_blank" as const } : {});

const circle = `inline-flex size-12 items-center justify-center rounded-full no-underline transition-[filter] hover:brightness-95 ${FOCUS}`;
const cap = "mt-1 block text-center text-xs font-medium text-[#374151]";

/**
 * Compact contact actions. One entry = a direct link; several entries = a labelled list opens under the bar so no number,
 * address or website is ever dropped. Share uses the device share sheet, else copies the link. Icons are decorative; names are text.
 */
export default function ActionBar({ title, phones, emails, websites, vcfHref, preview = false, showSave = true }: {
  title: string; phones: ActionRow[]; emails: ActionRow[]; websites: ActionRow[]; vcfHref: string | null; preview?: boolean; showSave?: boolean;
}) {
  const [open, setOpen] = useState<Key | null>(null);
  const [msg, setMsg] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(null); trigger.current?.focus(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const groups: { key: Key; name: string; tone: Tone; icon: ReactNode; rows: { id: string; name: string; href: string }[] }[] = [
    { key: "call", name: "Call", tone: "call", icon: <LuPhone aria-hidden="true" size={22} />, rows: phones.filter((r) => safe(r.href)).map((r) => ({ id: r.id, name: `${r.label ? r.label[0].toUpperCase() + r.label.slice(1) + ": " : ""}${r.text}`, href: r.href })) },
    { key: "whatsapp", name: "WhatsApp", tone: "whatsapp", icon: <FaWhatsapp aria-hidden="true" size={22} />, rows: phones.filter((r) => r.whatsapp && safe(r.whatsapp)).map((r) => ({ id: r.id, name: r.text, href: r.whatsapp as string })) },
    { key: "email", name: "Email", tone: "email", icon: <LuMail aria-hidden="true" size={22} />, rows: emails.filter((r) => safe(r.href)).map((r) => ({ id: r.id, name: r.text, href: r.href })) },
    { key: "website", name: "Website", tone: "website", icon: <LuGlobe aria-hidden="true" size={22} />, rows: websites.filter((r) => safe(r.href)).map((r) => ({ id: r.id, name: r.text, href: r.href })) },
  ];

  async function share() {
    const url = window.location.href.split("#")[0];
    try {
      if (navigator.share) { await navigator.share({ title, url }); return; }
      await navigator.clipboard.writeText(url);
      setMsg("Link copied");
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      setMsg("Copy this page’s address from your browser bar");
    }
    setTimeout(() => setMsg(""), 4000);
  }
  const panel = groups.find((g) => g.key === open);
  return (
    <div ref={root} className="mb-5">
      <ul className="m-0 flex list-none flex-wrap justify-center gap-x-3 gap-y-3 p-0">
        {groups.filter((g) => g.rows.length).map((g) => (
          <li key={g.key} className="w-[4.5rem]">
            {g.rows.length === 1 ? (
              <a style={toneStyle(g.tone)} className={`${circle} mx-auto`} href={g.rows[0].href} aria-label={`${g.name}: ${g.rows[0].name}`} title={`${g.name}: ${g.rows[0].name}`} {...ext(g.rows[0].href)}>{g.icon}</a>
            ) : (
              <button type="button" style={toneStyle(g.tone)} className={`${circle} mx-auto`} aria-expanded={open === g.key} aria-controls="action-choices" aria-label={`${g.name}: choose from ${g.rows.length}`} title={`${g.name}: ${g.rows.length} to choose from`}
                ref={open === g.key ? trigger : undefined} onClick={(e) => { trigger.current = e.currentTarget; setOpen(open === g.key ? null : g.key); }}>{g.icon}</button>
            )}
            <span className={cap} aria-hidden="true">{g.name}{g.rows.length > 1 ? ` (${g.rows.length})` : ""}</span>
          </li>
        ))}
        <li className="w-[4.5rem]">
          <button type="button" style={toneStyle("share")} className={`${circle} mx-auto`} onClick={share} aria-label="Share this page" title="Share this page"><LuShare2 aria-hidden="true" size={22} /></button>
          <span className={cap} aria-hidden="true">Share</span>
        </li>
      </ul>
      {showSave ? (
        <div className="mt-4">
          {vcfHref ? (
            <a style={{ background: "var(--qc-accent)", color: "#fff" }} className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-control px-5 text-base font-semibold no-underline shadow-[0_1px_2px_rgba(0,0,0,.18)] hover:brightness-110 ${FOCUS}`} href={vcfHref} aria-label="Save contact to your phone" title="Save contact to your phone">
              <LuUserPlus aria-hidden="true" size={20} /><span aria-hidden="true">Save contact</span>
            </a>
          ) : (
            <span className="flex min-h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-control border border-dashed border-[#9ca3af] bg-[#f3f4f6] px-5 text-base font-medium text-[#4b5563]" role="img" aria-label="Save contact (available once published)" title="Save contact (available once published)">
              <LuUserPlus aria-hidden="true" size={20} /><span aria-hidden="true">Save contact</span>
            </span>
          )}
        </div>
      ) : null}
      {panel ? (
        <div id="action-choices" role="group" aria-label={`${panel.name} options`} className="mx-auto mt-3 max-w-[360px] rounded-control border border-[var(--qc-line)] bg-white p-1 shadow-[0_2px_8px_rgba(0,0,0,.08)]">
          <ul className="m-0 list-none p-0">
            {panel.rows.map((r) => (
              <li key={r.id}><a href={r.href} className={`flex min-h-12 items-center break-all px-3 font-medium text-ink ${FOCUS}`} {...ext(r.href)}>{r.name}</a></li>
            ))}
          </ul>
          <button type="button" className="min-h-12 w-full text-sm text-muted" onClick={() => { setOpen(null); trigger.current?.focus(); }}>Close</button>
        </div>
      ) : null}
      {preview && !vcfHref && showSave ? <p className="mt-1.5 text-center text-xs text-muted">Preview only. Save contact works on the published page.</p> : null}
      <span role="status" className="sr-only">{msg}</span>
      {msg ? <p aria-hidden="true" className="mt-2 text-center text-sm">{msg}</p> : null}
    </div>
  );
}
