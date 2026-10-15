"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { FaWhatsapp } from "react-icons/fa6";
import { LuGlobe, LuMail, LuPhone, LuShare2, LuUserPlus } from "react-icons/lu";

export type ActionRow = { id: string; label: string; text: string; href: string; whatsapp?: string | null };
type Key = "call" | "whatsapp" | "email" | "website";
const safe = (h: unknown): h is string => typeof h === "string" && /^(https?:\/\/|tel:|mailto:)/i.test(h);
const ext = (h: string) => (/^https?:\/\//i.test(h) ? { rel: "noopener noreferrer", target: "_blank" as const } : {});

const circle = "inline-flex size-12 items-center justify-center rounded-full border border-black/15 bg-white text-ink no-underline hover:bg-soft focus-visible:outline-2 focus-visible:outline-offset-2";
const cap = "mt-1 block text-center text-xs text-muted";

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

  const groups: { key: Key; name: string; icon: ReactNode; rows: { id: string; name: string; href: string }[] }[] = [
    { key: "call", name: "Call", icon: <LuPhone aria-hidden="true" size={22} />, rows: phones.filter((r) => safe(r.href)).map((r) => ({ id: r.id, name: `${r.label ? r.label[0].toUpperCase() + r.label.slice(1) + ": " : ""}${r.text}`, href: r.href })) },
    { key: "whatsapp", name: "WhatsApp", icon: <FaWhatsapp aria-hidden="true" size={22} />, rows: phones.filter((r) => r.whatsapp && safe(r.whatsapp)).map((r) => ({ id: r.id, name: r.text, href: r.whatsapp as string })) },
    { key: "email", name: "Email", icon: <LuMail aria-hidden="true" size={22} />, rows: emails.filter((r) => safe(r.href)).map((r) => ({ id: r.id, name: r.text, href: r.href })) },
    { key: "website", name: "Website", icon: <LuGlobe aria-hidden="true" size={22} />, rows: websites.filter((r) => safe(r.href)).map((r) => ({ id: r.id, name: r.text, href: r.href })) },
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
    <div ref={root} className="mb-6">
      <ul className="m-0 flex list-none flex-wrap justify-center gap-x-4 gap-y-3 p-0">
        {groups.filter((g) => g.rows.length).map((g) => (
          <li key={g.key}>
            {g.rows.length === 1 ? (
              <a className={circle} href={g.rows[0].href} aria-label={`${g.name}: ${g.rows[0].name}`} title={`${g.name}: ${g.rows[0].name}`} {...ext(g.rows[0].href)}>{g.icon}</a>
            ) : (
              <button type="button" className={circle} aria-expanded={open === g.key} aria-controls="action-choices" aria-label={`${g.name}: choose from ${g.rows.length}`} title={`${g.name}: ${g.rows.length} to choose from`}
                ref={open === g.key ? trigger : undefined} onClick={(e) => { trigger.current = e.currentTarget; setOpen(open === g.key ? null : g.key); }}>{g.icon}</button>
            )}
            <span className={cap} aria-hidden="true">{g.name}{g.rows.length > 1 ? ` (${g.rows.length})` : ""}</span>
          </li>
        ))}
        <li>
          <button type="button" className={circle} onClick={share} aria-label="Share this page" title="Share this page"><LuShare2 aria-hidden="true" size={22} /></button>
          <span className={cap} aria-hidden="true">Share</span>
        </li>
        {showSave ? (
          <li>
            {vcfHref ? (
              <a className={`${circle} !border-transparent !bg-brand !text-white hover:!bg-brand-hover`} href={vcfHref} aria-label="Save contact to your phone" title="Save contact to your phone"><LuUserPlus aria-hidden="true" size={22} /></a>
            ) : (
              <span className={`${circle} opacity-50`} role="img" aria-label="Save contact (available once published)" title="Save contact (available once published)"><LuUserPlus aria-hidden="true" size={22} /></span>
            )}
            <span className={`${cap} font-medium !text-ink`} aria-hidden="true">Save contact</span>
          </li>
        ) : null}
      </ul>
      {panel ? (
        <div id="action-choices" role="group" aria-label={`${panel.name} options`} className="mx-auto mt-3 max-w-[360px] rounded-control border border-divider bg-white p-1">
          <ul className="m-0 list-none p-0">
            {panel.rows.map((r) => (
              <li key={r.id}><a href={r.href} className="flex min-h-12 items-center break-all px-3 text-brand" {...ext(r.href)}>{r.name}</a></li>
            ))}
          </ul>
          <button type="button" className="min-h-12 w-full text-sm text-muted" onClick={() => { setOpen(null); trigger.current?.focus(); }}>Close</button>
        </div>
      ) : null}
      {preview && !vcfHref && showSave ? <p className="mt-3 text-center text-[13px] text-muted">Preview only. Save contact works on the published page.</p> : null}
      <span role="status" className="sr-only">{msg}</span>
      {msg ? <p aria-hidden="true" className="mt-2 text-center text-sm">{msg}</p> : null}
    </div>
  );
}
