import type { ReactNode } from "react";
import { LuGlobe, LuMail, LuPhone } from "react-icons/lu";
import { FOCUS, toneStyle, type Tone } from "@/components/pages/card-theme";

export type ContactRow = { id: string; label: string; text: string; href: string };
const ICON: Record<"phone" | "email" | "website", { tone: Tone; icon: ReactNode }> = {
  phone: { tone: "call", icon: <LuPhone aria-hidden="true" size={18} /> },
  email: { tone: "email", icon: <LuMail aria-hidden="true" size={18} /> },
  website: { tone: "website", icon: <LuGlobe aria-hidden="true" size={18} /> },
};
const ok = (h: unknown): h is string => typeof h === "string" && /^(https?:\/\/|tel:|mailto:)/i.test(h);
const ext = (h: string) => (/^https?:\/\//i.test(h) ? { rel: "noopener noreferrer", target: "_blank" as const } : {});

/** Aligned, tappable contact rows: tinted icon chip, small label, value. Every published entry is listed. */
export default function ContactRows({ title, kind, rows, label }: { title: string; kind: "phone" | "email" | "website"; rows: ContactRow[]; label?: string }) {
  const list = rows.filter((r) => ok(r.href) && typeof r.text === "string");
  if (!list.length) return null;
  const { tone, icon } = ICON[kind];
  return (
    <section aria-label={label ?? title} className="mb-5">
      <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--qc-accent)]">{title}</h2>
      <ul className="m-0 list-none divide-y divide-[var(--qc-line)] p-0">
        {list.map((r) => (
          <li key={r.id}>
            <a href={r.href} {...ext(r.href)} className={`grid min-h-14 grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3 py-2 text-ink no-underline ${FOCUS}`}>
              <span style={toneStyle(tone)} className="inline-flex size-10 items-center justify-center rounded-full">{icon}</span>
              <span className="min-w-0">
                {r.label ? <span className="block text-xs capitalize text-muted">{r.label}</span> : null}
                <span className="block break-words text-base font-medium leading-snug [overflow-wrap:anywhere]">{r.text}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
