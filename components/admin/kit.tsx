import Link from "next/link";
import type { ReactNode } from "react";

export const kobo = (k: number | null | undefined) =>
  k == null ? "–" : `₦${(k / 100).toLocaleString("en-US", { minimumFractionDigits: k % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

export const lagos = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Lagos", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) + " WAT" : "–";

export function PageHead({ title, lead, actions }: { title: string; lead?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.5px] sm:text-[32px]">{title}</h1>
        {lead ? <p className="mt-2 max-w-[640px] text-muted">{lead}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
    </header>
  );
}

export function Panel({ title, children, aside }: { title?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="mb-8 rounded-panel bg-surface p-5 sm:p-6">
      {title || aside ? (
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          {title ? <h2 className="text-xl font-medium">{title}</h2> : <span />}
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** The table scrolls inside a labelled, keyboard-focusable region; the page itself never overflows. */
export function DataTable({ label, head, children, empty }: { label: string; head: string[]; children: ReactNode; empty?: ReactNode }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className="relative overflow-x-auto rounded-control outline-offset-2">
      <table className="w-full min-w-[560px] border-collapse text-left text-[15px]">
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr className="border-b border-divider text-[13px] text-muted">
            {head.map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty}
    </div>
  );
}
export const Td = ({ children, className = "" }: { children?: ReactNode; className?: string }) => <td className={`border-b border-divider px-3 py-3 align-top ${className}`}>{children}</td>;

const BADGE: Record<string, string> = {
  good: "bg-soft text-brand",
  warn: "bg-warning-bg text-warning",
  bad: "bg-[#f6e0e1] text-danger",
  neutral: "bg-disabled text-muted",
};
/** Status always has text, never colour alone. */
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "good" | "warn" | "bad" | "neutral" }) {
  return <span className={`inline-block rounded px-2 py-1 text-xs font-medium ${BADGE[tone]}`}>{children}</span>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-control border border-dashed border-divider p-6 text-center">
      <p className="font-medium">{title}</p>
      {children ? <p className="mt-1 text-sm text-muted">{children}</p> : null}
    </div>
  );
}

/** A load failure is never shown as zero records. */
export function LoadError({ what }: { what: string }) {
  return (
    <div role="alert" className="rounded-control bg-[#f6e0e1] p-4 text-sm text-danger">
      <strong className="block font-medium">Could not load {what}.</strong>
      Reload the page to try again. Nothing here should be read as “no records”.
    </div>
  );
}

/** A feature that cannot work yet: disabled, with the exact dependency. Never simulated. */
export function Blocked({ title, dependency, children }: { title: string; dependency: string; children?: ReactNode }) {
  return (
    <div className="rounded-control bg-warning-bg p-4 text-sm" role="note">
      <strong className="block font-medium text-warning">{title}: not available yet</strong>
      {children ? <p className="mt-1 text-muted">{children}</p> : null}
      <p className="mt-2 text-muted">
        <span className="font-medium text-ink">Needs:</span> {dependency}
      </p>
    </div>
  );
}

export function Denied() {
  return (
    <div className="mx-auto max-w-[520px] py-12">
      <h1 className="mb-2 text-[28px] font-semibold">No access</h1>
      <p className="text-muted">Your staff role cannot open this view.</p>
      <Link href="/admin" className="mt-4 inline-block font-medium text-brand no-underline">
        Back to overview
      </Link>
    </div>
  );
}

export function KV({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[180px_1fr]">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-[13px] text-muted">{k}</dt>
          <dd className="min-w-0 break-words">{v ?? "–"}</dd>
        </div>
      ))}
    </dl>
  );
}

export const linkCls = "font-medium text-brand no-underline hover:text-brand-hover";

/** Informational note that is not an error. */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="note" className="mb-6 rounded-control bg-soft p-4 text-sm text-ink">
      {children}
    </p>
  );
}
