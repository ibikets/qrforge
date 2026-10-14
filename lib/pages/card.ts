/**
 * Digital Business Card: structured content, validation, the public snapshot and the downloadable contact file.
 * Pure functions, no I/O, shared by the editor (browser) and the routes (server). Nothing here ever produces HTML:
 * the public page renders these fields as text, and links only from the http(s)/tel/mailto forms built below.
 */
import { fold } from "@/lib/vcf";
import { GROUPS, dedupeKey, socialError, socialUrl, vEsc, type ContactGroup } from "@/lib/qr-contact";

export const MAX_ROWS = 5;
export const ACCENTS = [
  { id: "forest", label: "Forest", bg: "#1f4d3a", fg: "#ffffff" },
  { id: "ink", label: "Ink", bg: "#1f2937", fg: "#ffffff" },
  { id: "clay", label: "Clay", bg: "#8a3b24", fg: "#ffffff" },
  { id: "sky", label: "Sky", bg: "#0b5a8a", fg: "#ffffff" },
] as const;
export type AccentId = (typeof ACCENTS)[number]["id"];

export type CardRow = { id: string; label: string; value: string; public: boolean; whatsapp?: boolean };
export type Card = {
  name: string;
  role: string;
  company: string;
  intro: string;
  accent: AccentId;
  portraitId: string | null;
  logoId: string | null;
  phones: CardRow[];
  emails: CardRow[];
  websites: CardRow[];
  socials: CardRow[];
};
export type RowGroup = "phones" | "emails" | "websites" | "socials";
export const ROW_GROUPS: RowGroup[] = ["phones", "emails", "websites", "socials"];
const CONTACT_GROUP: Record<RowGroup, ContactGroup> = { phones: "phone", emails: "email", websites: "website", socials: "social" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROW_ID = /^[a-z0-9_-]{1,24}$/i;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export const newRowId = () => "r" + Math.random().toString(36).slice(2, 10);
export const emptyCard = (): Card => ({
  name: "", role: "", company: "", intro: "", accent: "forest", portraitId: null, logoId: null,
  phones: [{ id: newRowId(), label: "mobile", value: "", public: true, whatsapp: false }],
  emails: [{ id: newRowId(), label: "work", value: "", public: true }],
  websites: [{ id: newRowId(), label: "", value: "", public: true }],
  socials: [],
});

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim().slice(0, max) : "");

/** Coerce untrusted JSON into a Card of the right shape and bounded size. Unknown keys are dropped. Never throws. */
export function normaliseCard(raw: unknown): Card {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const rows = (g: RowGroup): CardRow[] => {
    const src = Array.isArray(r[g]) ? (r[g] as unknown[]) : [];
    const seen = new Set<string>();
    return src.slice(0, MAX_ROWS).flatMap((x) => {
      if (!x || typeof x !== "object") return [];
      const o = x as Record<string, unknown>;
      let id = typeof o.id === "string" && ROW_ID.test(o.id) ? o.id : newRowId();
      if (seen.has(id)) id = newRowId();
      seen.add(id);
      const row: CardRow = { id, label: str(o.label, 30), value: str(o.value, g === "websites" || g === "socials" ? 300 : 120), public: o.public !== false };
      if (g === "phones") row.whatsapp = o.whatsapp === true;
      return [row];
    });
  };
  const accent = ACCENTS.some((a) => a.id === r.accent) ? (r.accent as AccentId) : "forest";
  const media = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v.toLowerCase() : null);
  return {
    name: str(r.name, 80), role: str(r.role, 80), company: str(r.company, 80), intro: str(r.intro, 280), accent,
    portraitId: media(r.portraitId), logoId: media(r.logoId),
    phones: rows("phones"), emails: rows("emails"), websites: rows("websites"), socials: rows("socials"),
  };
}

export type CardErrors = Record<string, string>;

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
export const phoneDigits = (v: string) => v.replace(/\D/g, "");
/** Normalised website address (https assumed when no scheme) or null. Only http(s) is ever allowed. */
export function websiteUrl(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password) return null;
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Field-level problems. `forPublish` additionally requires what a recipient needs to see. Keys look like `phones.0.value`. */
export function validateCard(c: Card, forPublish: boolean): CardErrors {
  const e: CardErrors = {};
  for (const k of ["name", "role", "company", "intro"] as const) if (CONTROL.test(c[k])) e[k] = "Remove unsupported control characters.";
  if (forPublish && !c.name) e.name = "Enter the name to show on the card.";
  for (const g of ROW_GROUPS) {
    const cg = CONTACT_GROUP[g];
    const seen = new Map<string, number>();
    c[g].forEach((row, i) => {
      const k = `${g}.${i}.value`;
      const v = row.value;
      if (!v) return; // blank rows are dropped on publish; nothing to validate
      if (CONTROL.test(v) || CONTROL.test(row.label)) return void (e[k] = "Remove unsupported characters.");
      if (g === "phones") {
        const d = phoneDigits(v);
        if (!/^[+\d\s().-]+$/.test(v) || d.length < 7 || d.length > 15) e[k] = "Enter a phone number with 7 to 15 digits.";
        else if (row.whatsapp && !v.trim().startsWith("+")) e[k] = "WhatsApp needs the international form, starting with + and the country code.";
      } else if (g === "emails") {
        if (!EMAIL.test(v)) e[k] = "Enter a valid email address.";
      } else if (g === "websites") {
        if (!websiteUrl(v)) e[k] = "Enter a valid website address (https:// or a domain such as example.com).";
      } else {
        const m = socialError(row.label || "other", v);
        if (m) e[k] = m;
      }
      if (!e[k]) {
        const dk = dedupeKey(cg, g === "websites" ? (websiteUrl(v) ?? v) : v, row.label);
        if (seen.has(dk)) e[k] = `This repeats ${GROUPS[cg].singular} ${seen.get(dk)! + 1}.`;
        else seen.set(dk, i);
      }
    });
  }
  if (forPublish && !ROW_GROUPS.some((g) => c[g].some((r) => r.value && r.public)))
    e.contact = "Add at least one public phone, email, website or social link so people can reach you.";
  return e;
}

// ---------- published snapshot: the allowlist of what the public may see ----------
export type PubRow = { id: string; label: string; text: string; href: string };
export type Snapshot = {
  v: 1;
  name: string; role: string; company: string; intro: string; accent: AccentId;
  portraitId: string | null; logoId: string | null;
  phones: (PubRow & { whatsapp: string | null })[];
  emails: PubRow[]; websites: PubRow[]; socials: PubRow[];
};

const telHref = (v: string) => `tel:${v.trim().startsWith("+") ? "+" : ""}${phoneDigits(v)}`;
/** Only public, non-blank, valid rows survive; private rows and flags are not copied. */
export function snapshotOf(c: Card): Snapshot {
  const pub = (g: RowGroup) => c[g].filter((r) => r.public && r.value);
  return {
    v: 1, name: c.name, role: c.role, company: c.company, intro: c.intro, accent: c.accent,
    portraitId: c.portraitId, logoId: c.logoId,
    phones: pub("phones").map((r) => ({ id: r.id, label: r.label, text: r.value, href: telHref(r.value), whatsapp: r.whatsapp ? `https://wa.me/${phoneDigits(r.value)}` : null })),
    emails: pub("emails").map((r) => ({ id: r.id, label: r.label, text: r.value, href: `mailto:${r.value}` })),
    websites: pub("websites").map((r) => ({ id: r.id, label: r.label, text: r.value.replace(/^https?:\/\//i, "").replace(/\/$/, ""), href: websiteUrl(r.value)! })),
    socials: pub("socials").flatMap((r) => { const u = socialUrl(r.label || "other", r.value); return u ? [{ id: r.id, label: r.label || "other", text: r.value.replace(/^https:\/\//i, "").replace(/\/$/, ""), href: u }] : []; }),
  };
}

/** Read a stored snapshot defensively (it came from our own database, but rendering must never throw or trust shape). */
export function readSnapshot(raw: unknown): Snapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Snapshot;
  if (s.v !== 1 || typeof s.name !== "string") return null;
  const arr = <T,>(x: T[] | undefined) => (Array.isArray(x) ? x : []);
  return { ...s, phones: arr(s.phones), emails: arr(s.emails), websites: arr(s.websites), socials: arr(s.socials) };
}

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => Array.from(w)[0]?.toUpperCase() ?? "").join("") || "?";

// ---------- downloadable contact (vCard 3.0, CRLF, 75-octet folding) ----------
const VT: Record<string, string> = { mobile: "CELL", work: "WORK", home: "HOME" };

/** photoJpeg: small square JPEG (see media.ts). Omitted when absent; never replaced by the logo. */
export function buildVcf(s: Snapshot, photoJpeg?: Uint8Array | null): string {
  const parts = s.name.trim().split(/\s+/);
  const last = parts.length > 1 ? parts.pop()! : "";
  const first = parts.join(" ");
  const L = ["BEGIN:VCARD", "VERSION:3.0", `N:${vEsc(last)};${vEsc(first)};;;`, `FN:${vEsc(s.name)}`];
  if (s.company) L.push(`ORG:${vEsc(s.company)}`);
  if (s.role) L.push(`TITLE:${vEsc(s.role)}`);
  for (const p of s.phones) L.push(`TEL;TYPE=${VT[p.label] ?? "CELL"}:${p.text.trim()}`);
  for (const m of s.emails) L.push(`EMAIL;TYPE=INTERNET,${m.label === "home" ? "HOME" : "WORK"}:${m.text}`);
  for (const w of s.websites) L.push(`URL:${w.href}`);
  for (const x of s.socials) L.push(`URL:${x.href}`);
  if (s.intro) L.push(`NOTE:${vEsc(s.intro)}`);
  if (photoJpeg?.length) L.push(`PHOTO;ENCODING=b;TYPE=JPEG:${Buffer.from(photoJpeg).toString("base64")}`);
  L.push("END:VCARD");
  return L.map(fold).join("\r\n") + "\r\n";
}

const row = (r: PubRow, extra: Partial<CardRow> = {}): CardRow => ({ id: r.id, label: r.label, value: r.text, public: true, ...extra });
/** A revision keeps only public details, so a restored draft contains only those. Private rows are not recoverable from history. */
export function cardFromSnapshot(s: Snapshot): Card {
  return normaliseCard({
    name: s.name, role: s.role, company: s.company, intro: s.intro, accent: s.accent, portraitId: s.portraitId, logoId: s.logoId,
    phones: s.phones.map((p) => row(p, { whatsapp: !!p.whatsapp })), emails: s.emails.map((r) => row(r)),
    websites: s.websites.map((r) => row(r, { value: r.href })), socials: s.socials.map((r) => row(r, { value: r.href })),
  });
}

