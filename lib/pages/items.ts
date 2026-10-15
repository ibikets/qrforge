/**
 * Pure helpers for the Phase 5 sections (priced items, events, display-only offers). No I/O, no React.
 * Shared by the validator, the public views and the editors so every screen formats and checks the same way.
 */
export const CURRENCIES = ["NGN", "USD", "GBP", "EUR", "GHS", "KES", "ZAR"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const isCurrency = (v: unknown): v is Currency => typeof v === "string" && (CURRENCIES as readonly string[]).includes(v);

export type ItemStatus = "available" | "limited" | "preorder" | "sold_out";
export const STATUSES: ItemStatus[] = ["available", "limited", "preorder", "sold_out"];
export const STATUS_LABEL: Record<ItemStatus, string> = { available: "Available", limited: "Limited", preorder: "Pre-order", sold_out: "Sold out" };
export const MENU_STATUSES: ItemStatus[] = ["available", "limited", "sold_out"];
export const isStatus = (v: unknown): v is ItemStatus => typeof v === "string" && (STATUSES as string[]).includes(v);

export const DIETARY = ["vegetarian", "vegan", "halal", "gluten_free", "dairy_free", "contains_nuts", "spicy"] as const;
export type Dietary = (typeof DIETARY)[number];
export const DIETARY_LABEL: Record<Dietary, string> = { vegetarian: "Vegetarian", vegan: "Vegan", halal: "Halal", gluten_free: "Gluten-free", dairy_free: "Dairy-free", contains_nuts: "Contains nuts", spicy: "Spicy" };
export const isDietary = (v: unknown): v is Dietary => typeof v === "string" && (DIETARY as readonly string[]).includes(v);

/** "2,500", "2500.5", "₦" not accepted: digits with an optional dot and at most two decimals. Returns the amount or null. */
export function parsePrice(raw: string): number | null {
  const s = raw.replace(/[,\s]/g, "");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100) / 100;
}
export function formatPrice(n: number, currency: string): string {
  const cur = isCurrency(currency) ? currency : "NGN";
  const whole = Number.isInteger(n);
  try { return new Intl.NumberFormat("en", { style: "currency", currency: cur, currencyDisplay: "narrowSymbol", minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(n); }
  catch { return `${cur} ${n}`; }
}

// ---------- dates and times (wall-clock strings plus an IANA zone; nothing depends on the viewer's own zone) ----------
export const LOCAL_DT = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/;
export const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
export function validDate(y: number, m: number, d: number): boolean {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d && y >= 2000 && y <= 2100;
}
export const validLocalDateTime = (s: string) => { const m = LOCAL_DT.exec(s); return !!m && validDate(+m[1], +m[2], +m[3]); };
export const validDateOnly = (s: string) => { const m = DATE_ONLY.exec(s); return !!m && validDate(+m[1], +m[2], +m[3]); };

/** Milliseconds since the epoch for a wall-clock time in a zone (two refinement passes handle offset changes). */
export function zonedToEpoch(local: string, tz: string): number | null {
  const m = LOCAL_DT.exec(local); if (!m) return null;
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  try {
    const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    const offsetAt = (t: number) => {
      const p = Object.fromEntries(f.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
      return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - t;
    };
    let t = asUtc - offsetAt(asUtc);
    t = asUtc - offsetAt(t);
    return t;
  } catch { return null; }
}
/** Today's date (YYYY-MM-DD) in a zone. */
export function todayIn(tz: string, now = Date.now()): string {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now)); }
  catch { return new Date(now).toISOString().slice(0, 10); }
}
/** "Sat 12 Dec 2026, 6:00 pm" for a wall-clock string. */
export function wallText(local: string, dateOnly = false): string {
  const m = LOCAL_DT.exec(local) ?? /^(\d{4})-(\d{2})-(\d{2})$/.exec(local); if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0));
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(d);
  if (dateOnly || !m[4]) return date;
  return `${date}, ${new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" }).format(d).toLowerCase()}`;
}
export function tzName(tz: string): string { return tz.replace(/_/g, " "); }

export type EventState = "upcoming" | "now" | "ended";
export function eventState(startsAt: string, endsAt: string, tz: string, now = Date.now()): EventState | null {
  const s = zonedToEpoch(startsAt, tz); if (s === null) return null;
  const e = endsAt ? zonedToEpoch(endsAt, tz) : null;
  const end = e ?? s + 3 * 3_600_000; // no end time: treated as over three hours after it starts
  return now < s ? "upcoming" : now <= end ? "now" : "ended";
}
export type OfferState = "scheduled" | "active" | "expired";
export function offerState(from: string, until: string, tz: string, now = Date.now()): OfferState {
  const today = todayIn(tz, now);
  if (from && today < from) return "scheduled";
  if (until && today > until) return "expired";
  return "active";
}

/** WhatsApp / email links for asking about one item. The message names the item and its price; it is built here, never from visitor input. */
export function enquiryLinks(enq: { whatsapp: string | null; email: string | null } | null, item: { name: string; price: number | null }, currency: string, pageName: string) {
  if (!enq) return { whatsapp: null, email: null };
  const price = item.price !== null ? ` (${formatPrice(item.price, currency)})` : "";
  const text = `Hello${pageName ? ` ${pageName}` : ""}, I would like to ask about ${item.name}${price}.`;
  return {
    whatsapp: enq.whatsapp ? `https://wa.me/${enq.whatsapp}?text=${encodeURIComponent(text)}` : null,
    email: enq.email ? `mailto:${enq.email}?subject=${encodeURIComponent(`Enquiry: ${item.name}`)}&body=${encodeURIComponent(text)}` : null,
  };
}
