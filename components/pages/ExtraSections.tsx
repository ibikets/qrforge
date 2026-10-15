import CopyCode from "@/components/pages/CopyCode";
import { eventState, offerState, tzName, wallText } from "@/lib/pages/items";
import type { PubBlock } from "@/lib/pages/blocks";

const h2 = "mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--qc-accent)]";
type Ev = Extract<PubBlock, { type: "event" }>;
type Of = Extract<PubBlock, { type: "offer" }>;

export function EventSection({ b }: { b: Ev }) {
  const st = eventState(b.startsAt, b.endsAt, b.timezone);
  const label = st === "ended" ? "This event has ended" : st === "now" ? "Happening now" : null;
  const sameDay = b.endsAt && b.endsAt.slice(0, 10) === b.startsAt.slice(0, 10);
  return (
    <section aria-label="Event details" className="mb-6">
      <h2 className={h2}>When</h2>
      {label ? <p className="mb-2"><span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${st === "ended" ? "bg-[#f3e6e6] text-[#8a1c1c]" : "bg-[var(--qc-tint)] text-ink"}`}>{label}</span></p> : null}
      <p className="break-words text-base font-medium"><time dateTime={b.startsAt}>{wallText(b.startsAt)}</time></p>
      {b.endsAt ? <p className="break-words text-base">to <time dateTime={b.endsAt}>{sameDay ? wallText(b.endsAt).split(", ").pop() : wallText(b.endsAt)}</time></p> : null}
      <p className="mt-1 text-sm text-muted">{tzName(b.timezone)} time{b.online ? " · Online event" : ""}</p>
    </section>
  );
}

export function OfferSection({ b }: { b: Of }) {
  const st = offerState(b.validFrom, b.validUntil, b.timezone);
  const when = b.validFrom && b.validUntil ? `Valid ${wallText(b.validFrom, true)} to ${wallText(b.validUntil, true)}` : b.validUntil ? `Valid until ${wallText(b.validUntil, true)}` : b.validFrom ? `Valid from ${wallText(b.validFrom, true)}` : "No end date";
  return (
    <section aria-label={`Offer: ${b.title}`} className={`mb-6 rounded-control border border-[var(--qc-line)] p-4 `}>
      <h2 className="mb-1 break-words text-lg font-medium">{b.title}</h2>
      <p className="mb-2"><span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${st === "expired" ? "bg-[#f3e6e6] text-[#8a1c1c]" : "bg-[var(--qc-tint)] text-ink"}`}>{st === "expired" ? "Expired" : st === "scheduled" ? "Not started yet" : "Valid now"}</span></p>
      {b.description ? <p className="mb-2 whitespace-pre-line break-words text-base">{b.description}</p> : null}
      <p className="mb-2 text-sm text-muted">{when} ({tzName(b.timezone)})</p>
      {b.code && st === "active" ? <CopyCode code={b.code} /> : null}
      {b.code && st === "active" ? <p className="mb-2 text-xs text-muted">Shown for reference. Use it with whoever made this offer; Qrenuvi does not check or apply codes.</p> : null}
      {b.code && st !== "active" ? <p className="mb-2 text-sm">Code <span className="font-mono">{st === "expired" ? "no longer shown" : "shown when the offer starts"}</span></p> : null}
      {b.conditions ? <><h3 className="mb-0.5 mt-3 text-sm font-medium">Conditions</h3><p className="whitespace-pre-line break-words text-sm text-muted">{b.conditions}</p></> : null}
    </section>
  );
}
