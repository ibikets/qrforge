/**
 * Structured pages built from sections ("blocks"): business pages, multi-link pages, social profile pages and the later page kinds.
 * Pure functions, no I/O, shared by the editor (browser) and the routes (server). Nothing here produces HTML:
 * the public page renders these fields as text, and links only come from the http(s) / tel / mailto / https://wa.me forms built below.
 *
 * Draft = what the owner edits (raw text is never rewritten while typing). Snapshot = what the public may see:
 * only visible sections, only finished and valid items, with links already normalised.
 */
import { ACCENTS, buildVcf, newRowId, rowProblem, websiteUrl, type AccentId, type CardRow } from "@/lib/pages/card";
import { socialUrl } from "@/lib/qr-contact";
import {
  MENU_STATUSES, isCurrency, isDietary, isStatus, parsePrice, validDateOnly, validLocalDateTime, zonedToEpoch,
  type Currency, type Dietary, type ItemStatus,
} from "@/lib/pages/items";

export type BlockKind = "business" | "links" | "social" | "document" | "collection" | "gallery" | "resume" | "presentation" | "menu" | "product" | "event" | "campaign" | "coupon";
export type BlockType = "header" | "text" | "actions" | "links" | "socials" | "hours" | "location" | "button" | "file" | "documents" | "gallery" | "entries" | "items" | "event" | "offer";

export type LinkItem = { id: string; label: string; url: string; note: string };
/** Facts about a stored file. Written by the server from the file's own record on every save and publish; a browser-supplied value is overwritten. */
export type FileMeta = { name: string; bytes: number; pages: number | null; mime: string };
export type ImgMeta = { w: number; h: number };
export type DocItem = { id: string; title: string; description: string; fileId: string | null; url: string; meta: FileMeta | null };
export type GalleryItem = { id: string; imageId: string | null; caption: string; alt: string; meta: ImgMeta | null };
export type EntryItem = { id: string; title: string; org: string; period: string; summary: string };
export type DayHours = { closed: boolean; open: string; close: string };
/** One priced entry: a dish on a menu or a product in a catalogue. The photo is optional; its alt text is the item name. */
export type CatItem = { id: string; name: string; description: string; price: string; imageId: string | null; meta: ImgMeta | null; status: ItemStatus; tags: Dietary[] };
export type Category = { id: string; name: string; items: CatItem[] };
type Common = { id: string; hidden: boolean };
export type Block =
  | (Common & { type: "header"; name: string; tagline: string; portraitId: string | null; logoId: string | null; coverId: string | null })
  | (Common & { type: "text"; heading: string; body: string })
  | (Common & { type: "actions"; phones: CardRow[]; emails: CardRow[]; websites: CardRow[] })
  | (Common & { type: "links"; heading: string; items: LinkItem[] })
  | (Common & { type: "socials"; heading: string; items: CardRow[] })
  | (Common & { type: "hours"; timezone: string; days: DayHours[]; note: string })
  | (Common & { type: "location"; address: string; note: string })
  | (Common & { type: "button"; label: string; url: string })
  | (Common & { type: "file"; heading: string; label: string; description: string; fileId: string | null; url: string; meta: FileMeta | null })
  | (Common & { type: "documents"; heading: string; items: DocItem[] })
  | (Common & { type: "gallery"; heading: string; items: GalleryItem[] })
  | (Common & { type: "entries"; heading: string; items: EntryItem[] })
  | (Common & { type: "items"; heading: string; currency: Currency; categories: Category[] })
  | (Common & { type: "event"; startsAt: string; endsAt: string; timezone: string; online: boolean })
  | (Common & { type: "offer"; title: string; code: string; description: string; validFrom: string; validUntil: string; timezone: string; conditions: string });
export type PageContent = { v: 2; kind: BlockKind; accent: AccentId; blocks: Block[] };
export type BlockErrors = Record<string, string>;

export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const MAX_BLOCKS = 20;
export const MAX_LINKS = 30;
export const MAX_SOCIALS = 12;
export const MAX_ACTION_ROWS = 10;
export const MAX_DOCS = 30;
export const MAX_GALLERY = 40;
export const MAX_ENTRIES = 12;
export const MAX_CATEGORIES = 12;
export const MAX_ITEMS_PER_CATEGORY = 40;
export const MAX_ITEMS = 100;
export const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/;

export type KindInfo = {
  label: string; blurb: string; titleHint: string;
  portrait: boolean; logo: boolean; cover: boolean; tagline: string;
  allow: Exclude<BlockType, "header">[];
  start: Exclude<BlockType, "header">[];
  max: Partial<Record<BlockType, number>>;
  /** Plain-language limits shown in the editor and on the chooser step. */
  notice?: string;
};
export const BLOCK_KINDS: BlockKind[] = ["business", "links", "social", "document", "collection", "gallery", "resume", "presentation", "menu", "product", "event", "campaign", "coupon"];
export const KIND_INFO: Record<BlockKind, KindInfo> = {
  business: {
    label: "Business page", titleHint: "e.g. Acme Ltd – main page",
    blurb: "Who you are, when you are open, where to find you and how to reach you. Call, WhatsApp, email and directions in one place.",
    portrait: true, logo: true, cover: false, tagline: "What you do, in a few words",
    allow: ["text", "actions", "hours", "location", "links", "socials", "button"],
    start: ["text", "actions", "hours", "location", "socials"],
    max: { header: 1, actions: 1, hours: 1, location: 1, socials: 1, text: 3, links: 3, button: 5 },
  },
  links: {
    label: "Multi-link page", titleHint: "e.g. Ada – links",
    blurb: "One address that opens a tidy list of your most important links, in the order you choose.",
    portrait: true, logo: true, cover: false, tagline: "A line about you or your brand",
    allow: ["links", "socials", "text", "button"],
    start: ["links", "socials"],
    max: { header: 1, socials: 1, text: 3, links: 3, button: 5 },
  },
  social: {
    label: "Social profile page", titleHint: "e.g. Ada – socials",
    blurb: "All your social profiles on one page, with a short line about you. Profiles are built from handles, so they stay correct.",
    portrait: true, logo: false, cover: false, tagline: "A line about you",
    allow: ["socials", "links", "text"],
    start: ["socials"],
    max: { header: 1, socials: 1, text: 2, links: 1 },
  },
  document: {
    label: "Document page", titleHint: "e.g. 2026 price list",
    blurb: "Share one PDF with a title, a short description, file details and a clear download button. Or link to a document that lives elsewhere.",
    portrait: false, logo: false, cover: true, tagline: "What this document is, in a line",
    allow: ["file", "text", "button"], start: ["file"], max: { header: 1, file: 1, text: 2, button: 3 },
  },
  collection: {
    label: "Document collection", titleHint: "e.g. Onboarding pack",
    blurb: "Several named documents on one page, each with its own description and download, in the order you choose.",
    portrait: false, logo: false, cover: true, tagline: "What this collection is for",
    allow: ["documents", "text"], start: ["documents"], max: { header: 1, documents: 1, text: 2 },
  },
  gallery: {
    label: "Image gallery", titleHint: "e.g. Spring collection",
    blurb: "A grid of your images with captions and alt text. Visitors can open each one full size.",
    portrait: false, logo: false, cover: false, tagline: "A line about these images",
    allow: ["gallery", "text"], start: ["gallery"], max: { header: 1, gallery: 1, text: 2 },
  },
  resume: {
    label: "Resume page", titleHint: "e.g. Ada – resume",
    blurb: "Your photo, headline, a short bio, experience and education, contact and social links, and an optional downloadable CV.",
    portrait: true, logo: false, cover: false, tagline: "Professional headline",
    allow: ["text", "entries", "actions", "socials", "file", "links"], start: ["text", "entries", "entries", "actions", "socials", "file"],
    max: { header: 1, text: 2, entries: 3, actions: 1, socials: 1, file: 1, links: 1 },
  },
  presentation: {
    label: "Presentation page", titleHint: "e.g. Q4 investor deck",
    blurb: "Share slides as a PDF people can download, or link to a presentation hosted elsewhere, with a cover and description.",
    portrait: false, logo: false, cover: true, tagline: "What this presentation covers",
    allow: ["file", "text", "button"], start: ["file"], max: { header: 1, file: 1, text: 2, button: 2 },
  },
  menu: {
    label: "Restaurant menu", titleHint: "e.g. Mama Put – dinner menu",
    blurb: "Your menu in categories, with photos, descriptions, prices, availability and dietary labels. Opening hours and location included.",
    portrait: false, logo: true, cover: true, tagline: "Cuisine or a short welcome",
    allow: ["items", "text", "hours", "location", "actions", "socials", "button"],
    start: ["items", "hours", "location", "actions"],
    max: { header: 1, items: 1, text: 2, hours: 1, location: 1, actions: 1, socials: 1, button: 2 },
    notice: "This page shows your menu. Visitors cannot order or pay through it. Keep prices and availability up to date by publishing changes.",
  },
  product: {
    label: "Product catalogue", titleHint: "e.g. Ada Fashion – catalogue",
    blurb: "A shop window: products in categories with photos, prices and availability, each with its own page and a WhatsApp or email enquiry button.",
    portrait: false, logo: true, cover: true, tagline: "What you sell, in a few words",
    allow: ["items", "text", "actions", "location", "hours", "socials", "button"],
    start: ["items", "actions", "text"],
    max: { header: 1, items: 1, text: 2, actions: 1, location: 1, hours: 1, socials: 1, button: 2 },
    notice: "This is a catalogue with enquiries. There is no cart, checkout, payment, stock count, order tracking or delivery: people contact you by WhatsApp or email to buy.",
  },
  event: {
    label: "Event page", titleHint: "e.g. Annual conference 2027",
    blurb: "Date, time and time zone, venue or online link, a description and a registration button.",
    portrait: false, logo: true, cover: true, tagline: "Event type or theme",
    allow: ["event", "text", "location", "button", "actions", "socials"],
    start: ["event", "text", "location", "button"],
    max: { header: 1, event: 1, text: 3, location: 1, button: 3, actions: 1, socials: 1 },
    notice: "Registration happens on the link you provide. Qrenuvi does not collect sign-ups or tickets.",
  },
  campaign: {
    label: "Campaign page", titleHint: "e.g. Black Friday 2026",
    blurb: "A focused landing page for a promotion or announcement: a strong cover, short message, offers and one clear button.",
    portrait: false, logo: true, cover: true, tagline: "The one-line message",
    allow: ["text", "offer", "event", "gallery", "button", "links", "actions", "socials"],
    start: ["text", "button"],
    max: { header: 1, text: 3, offer: 3, event: 1, gallery: 1, button: 3, links: 1, actions: 1, socials: 1 },
  },
  coupon: {
    label: "Offers page", titleHint: "e.g. Weekend offers",
    blurb: "Show your own offers with a code, how long each is valid and the conditions. For display: Qrenuvi does not apply or redeem codes.",
    portrait: false, logo: true, cover: true, tagline: "Who is making these offers",
    allow: ["offer", "text", "location", "actions", "button", "socials"],
    start: ["offer"],
    max: { header: 1, offer: 6, text: 2, location: 1, actions: 1, button: 2, socials: 1 },
    notice: "Offers are shown to visitors only. Qrenuvi does not apply, check or redeem codes. They are separate from Qrenuvi subscription discounts.",
  },
};
export const isBlockKind = (k: unknown): k is BlockKind => typeof k === "string" && (BLOCK_KINDS as string[]).includes(k);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = /^[a-z0-9_-]{1,24}$/i;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const httpsLink = (v: string) => { const u = websiteUrl(v); return u && u.startsWith("https://") ? u : null; };
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const newBlockId = () => "b" + Math.random().toString(36).slice(2, 10);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim().slice(0, max) : "");
const posInt = (v: unknown, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max ? v : null);
function fileMeta(v: unknown): FileMeta | null {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  const bytes = o ? posInt(o.bytes, 50_000_000) : null;
  if (!o || typeof o.name !== "string" || bytes === null || typeof o.mime !== "string") return null;
  return { name: o.name.slice(0, 120), bytes, pages: posInt(o.pages, 100_000), mime: o.mime.slice(0, 60) };
}
function imgMeta(v: unknown): ImgMeta | null {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  const w = o ? posInt(o.w, 20_000) : null, h = o ? posInt(o.h, 20_000) : null;
  return w && h ? { w, h } : null;
}
const media = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v.toLowerCase() : null);

export function validTimeZone(tz: string): boolean {
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); return tz.length > 0 && tz.length <= 64; } catch { return false; }
}
export const DEFAULT_TZ = "Africa/Lagos";
export const defaultDays = (): DayHours[] => Array.from({ length: 7 }, (_, i) => ({ closed: i === 6, open: "09:00", close: "17:00" }));

export const emptyItem = (): CatItem => ({ id: newRowId(), name: "", description: "", price: "", imageId: null, meta: null, status: "available", tags: [] });
export function emptyBlock(type: BlockType): Block {
  const c = { id: newBlockId(), hidden: false };
  switch (type) {
    case "header": return { ...c, type, name: "", tagline: "", portraitId: null, logoId: null, coverId: null };
    case "text": return { ...c, type, heading: "About", body: "" };
    case "actions": return { ...c, type, phones: [{ id: newRowId(), label: "mobile", value: "", public: true, whatsapp: false }], emails: [{ id: newRowId(), label: "work", value: "", public: true }], websites: [{ id: newRowId(), label: "", value: "", public: true }] };
    case "links": return { ...c, type, heading: "Links", items: [{ id: newRowId(), label: "", url: "", note: "" }] };
    case "socials": return { ...c, type, heading: "", items: [{ id: newRowId(), label: "instagram", value: "", public: true }] };
    case "hours": return { ...c, type, timezone: DEFAULT_TZ, days: defaultDays(), note: "" };
    case "location": return { ...c, type, address: "", note: "" };
    case "button": return { ...c, type, label: "", url: "" };
    case "file": return { ...c, type, heading: "", label: "Download", description: "", fileId: null, url: "", meta: null };
    case "documents": return { ...c, type, heading: "Documents", items: [{ id: newRowId(), title: "", description: "", fileId: null, url: "", meta: null }] };
    case "gallery": return { ...c, type, heading: "", items: [] };
    case "entries": return { ...c, type, heading: "Experience", items: [{ id: newRowId(), title: "", org: "", period: "", summary: "" }] };
    case "items": return { ...c, type, heading: "", currency: "NGN", categories: [{ id: newRowId(), name: "", items: [emptyItem()] }] };
    case "event": return { ...c, type, startsAt: "", endsAt: "", timezone: DEFAULT_TZ, online: false };
    case "offer": return { ...c, type, title: "", code: "", description: "", validFrom: "", validUntil: "", timezone: DEFAULT_TZ, conditions: "" };
  }
}
export function emptyContent(kind: BlockKind): PageContent {
  return { v: 2, kind, accent: "forest", blocks: [emptyBlock("header"), ...KIND_INFO[kind].start.map(emptyBlock)] };
}

// ---------- normalisation of untrusted JSON (never throws) ----------
const obj = (x: unknown): Record<string, unknown> | null => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null);
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
function uniqueId(raw: unknown, seen: Set<string>, make: () => string) {
  let id = typeof raw === "string" && ID.test(raw) ? raw : make();
  if (seen.has(id)) id = make();
  seen.add(id);
  return id;
}
function rows(src: unknown, max: number, valueMax: number, whatsapp: boolean): CardRow[] {
  const seen = new Set<string>();
  return arr(src).slice(0, max).flatMap((x) => {
    const o = obj(x); if (!o) return [];
    const row: CardRow = { id: uniqueId(o.id, seen, newRowId), label: str(o.label, 30), value: str(o.value, valueMax), public: o.public !== false };
    if (whatsapp) row.whatsapp = o.whatsapp === true;
    return [row];
  });
}

function normaliseBlock(raw: unknown, seen: Set<string>): Block | null {
  const o = obj(raw); if (!o) return null;
  const c = { id: uniqueId(o.id, seen, newBlockId), hidden: o.hidden === true };
  switch (o.type) {
    case "header": return { ...c, type: "header", name: str(o.name, 80), tagline: str(o.tagline, 160), portraitId: media(o.portraitId), logoId: media(o.logoId), coverId: media(o.coverId) };
    case "text": return { ...c, type: "text", heading: str(o.heading, 60), body: str(o.body, 1200) };
    case "actions": return { ...c, type: "actions", phones: rows(o.phones, MAX_ACTION_ROWS, 120, true), emails: rows(o.emails, MAX_ACTION_ROWS, 120, false), websites: rows(o.websites, MAX_ACTION_ROWS, 300, false) };
    case "links": {
      const ids = new Set<string>();
      return { ...c, type: "links", heading: str(o.heading, 60), items: arr(o.items).slice(0, MAX_LINKS).flatMap((x) => { const i = obj(x); return i ? [{ id: uniqueId(i.id, ids, newRowId), label: str(i.label, 60), url: str(i.url, 300), note: str(i.note, 120) }] : []; }) };
    }
    case "socials": return { ...c, type: "socials", heading: str(o.heading, 60), items: rows(o.items, MAX_SOCIALS, 300, false) };
    case "hours": {
      const days = arr(o.days).slice(0, 7).map((d) => { const x = obj(d) ?? {}; return { closed: x.closed === true, open: str(x.open, 5), close: str(x.close, 5) }; });
      while (days.length < 7) days.push({ closed: true, open: "09:00", close: "17:00" });
      return { ...c, type: "hours", timezone: str(o.timezone, 64) || DEFAULT_TZ, days, note: str(o.note, 160) };
    }
    case "location": return { ...c, type: "location", address: str(o.address, 200), note: str(o.note, 200) };
    case "button": return { ...c, type: "button", label: str(o.label, 40), url: str(o.url, 300) };
    case "file": return { ...c, type: "file", heading: str(o.heading, 60), label: str(o.label, 60), description: str(o.description, 400), fileId: media(o.fileId), url: str(o.url, 300), meta: fileMeta(o.meta) };
    case "documents": {
      const ids = new Set<string>();
      return { ...c, type: "documents", heading: str(o.heading, 60), items: arr(o.items).slice(0, MAX_DOCS).flatMap((x) => { const i = obj(x); return i ? [{ id: uniqueId(i.id, ids, newRowId), title: str(i.title, 80), description: str(i.description, 300), fileId: media(i.fileId), url: str(i.url, 300), meta: fileMeta(i.meta) }] : []; }) };
    }
    case "gallery": {
      const ids = new Set<string>();
      return { ...c, type: "gallery", heading: str(o.heading, 60), items: arr(o.items).slice(0, MAX_GALLERY).flatMap((x) => { const i = obj(x); return i ? [{ id: uniqueId(i.id, ids, newRowId), imageId: media(i.imageId), caption: str(i.caption, 200), alt: str(i.alt, 200), meta: imgMeta(i.meta) }] : []; }) };
    }
    case "entries": {
      const ids = new Set<string>();
      return { ...c, type: "entries", heading: str(o.heading, 60), items: arr(o.items).slice(0, MAX_ENTRIES).flatMap((x) => { const i = obj(x); return i ? [{ id: uniqueId(i.id, ids, newRowId), title: str(i.title, 80), org: str(i.org, 80), period: str(i.period, 40), summary: str(i.summary, 500) }] : []; }) };
    }
    case "items": {
      const cids = new Set<string>(); let total = 0;
      const categories = arr(o.categories).slice(0, MAX_CATEGORIES).flatMap((x): Category[] => {
        const cat = obj(x); if (!cat) return [];
        const iids = new Set<string>();
        const items = arr(cat.items).slice(0, MAX_ITEMS_PER_CATEGORY).flatMap((y): CatItem[] => {
          const i = obj(y); if (!i || total >= MAX_ITEMS) return [];
          total++;
          return [{ id: uniqueId(i.id, iids, newRowId), name: str(i.name, 80), description: str(i.description, 400), price: str(i.price, 14), imageId: media(i.imageId), meta: imgMeta(i.meta),
            status: isStatus(i.status) ? i.status : "available", tags: [...new Set(arr(i.tags).filter(isDietary))] }];
        });
        return [{ id: uniqueId(cat.id, cids, newRowId), name: str(cat.name, 60), items }];
      });
      return { ...c, type: "items", heading: str(o.heading, 60), currency: isCurrency(o.currency) ? o.currency : "NGN", categories };
    }
    case "event": return { ...c, type: "event", startsAt: str(o.startsAt, 16), endsAt: str(o.endsAt, 16), timezone: str(o.timezone, 64) || DEFAULT_TZ, online: o.online === true };
    case "offer": return { ...c, type: "offer", title: str(o.title, 80), code: str(o.code, 32), description: str(o.description, 400), validFrom: str(o.validFrom, 10), validUntil: str(o.validUntil, 10), timezone: str(o.timezone, 64) || DEFAULT_TZ, conditions: str(o.conditions, 600) };
    default: return null;
  }
}

/** Menus have no pre-order status and carry dietary labels; catalogues carry neither dietary labels. */
function fixItems(kind: BlockKind, b: Extract<Block, { type: "items" }>): Block {
  return { ...b, categories: b.categories.map((c) => ({ ...c, items: c.items.map((i) => ({
    ...i, tags: kind === "menu" ? i.tags : [], status: kind === "menu" && !MENU_STATUSES.includes(i.status) ? "available" : i.status })) })) };
}

/** Coerce untrusted JSON into content for this kind: one header first, only allowed sections, counts capped. */
export function normaliseContent(kind: BlockKind, raw: unknown): PageContent {
  const r = obj(raw) ?? {};
  const info = KIND_INFO[kind];
  const seen = new Set<string>();
  const counts: Partial<Record<BlockType, number>> = {};
  let header: Block | null = null;
  const rest: Block[] = [];
  for (const x of arr(r.blocks).slice(0, MAX_BLOCKS * 2)) {
    const b = normaliseBlock(x, seen);
    if (!b) continue;
    if (b.type === "header") { if (!header) header = { ...b, hidden: false, portraitId: info.portrait ? b.portraitId : null, logoId: info.logo ? b.logoId : null, coverId: info.cover ? b.coverId : null }; continue; }
    if (!info.allow.includes(b.type)) continue;
    const fixed = b.type === "items" ? fixItems(kind, b) : b;
    counts[b.type] = (counts[b.type] ?? 0) + 1;
    if (counts[b.type]! > (info.max[b.type] ?? 1)) continue;
    if (rest.length < MAX_BLOCKS - 1) rest.push(fixed);
  }
  return { v: 2, kind, accent: ACCENTS.some((a) => a.id === r.accent) ? (r.accent as AccentId) : "forest", blocks: [header ?? emptyBlock("header"), ...rest] };
}

// ---------- validation ----------
/** Keys: `<blockId>.<field>` or `<blockId>.<group>.<rowId>`; page-level problems use `page`. */
export function validateContent(c: PageContent, forPublish: boolean): BlockErrors {
  const e: BlockErrors = {};
  const header = c.blocks[0];
  for (const b of c.blocks) {
    const text = (k: string, v: string) => { if (CONTROL.test(v)) e[`${b.id}.${k}`] = "Remove unsupported characters."; };
    switch (b.type) {
      case "header":
        text("name", b.name); text("tagline", b.tagline);
        if (forPublish && !b.name) e[`${b.id}.name`] = "Enter the name to show at the top of the page.";
        break;
      case "text": text("heading", b.heading); text("body", b.body); break;
      case "actions":
        for (const [g, list] of [["phones", b.phones], ["emails", b.emails], ["websites", b.websites]] as const)
          for (const row of list) { const p = rowProblem(g, row); if (p) e[`${b.id}.${g}.${row.id}`] = p; }
        dupes(b.id, "phones", b.phones, (v) => v.replace(/\D/g, ""), e);
        dupes(b.id, "emails", b.emails, (v) => v.trim().toLowerCase(), e);
        dupes(b.id, "websites", b.websites, (v) => websiteUrl(v)?.toLowerCase() ?? v.toLowerCase(), e);
        break;
      case "links": {
        text("heading", b.heading);
        for (const it of b.items) {
          if (CONTROL.test(it.label) || CONTROL.test(it.note)) e[`${b.id}.items.${it.id}`] = "Remove unsupported characters.";
          else if (it.url && !websiteUrl(it.url)) e[`${b.id}.items.${it.id}`] = "Enter a website address such as example.com or https://example.com/page (no spaces).";
          else if (it.url && !it.label && forPublish) e[`${b.id}.items.${it.id}`] = "Give this link a label people will see.";
          else if (!it.url && it.label && forPublish) e[`${b.id}.items.${it.id}`] = "Add the address this label opens.";
        }
        const seen = new Map<string, string>();
        for (const it of b.items) { const u = it.url && websiteUrl(it.url); if (!u || e[`${b.id}.items.${it.id}`]) continue; const k = u.toLowerCase(); if (seen.has(k)) e[`${b.id}.items.${it.id}`] = "This address is already in the list."; else seen.set(k, it.id); }
        break;
      }
      case "socials": {
        text("heading", b.heading);
        for (const row of b.items) { const p = rowProblem("socials", row); if (p) e[`${b.id}.items.${row.id}`] = p; }
        dupes(b.id, "items", b.items, () => "", e, (r) => socialUrl(r.label || "other", r.value)?.toLowerCase() ?? r.label);
        break;
      }
      case "hours": {
        if (!validTimeZone(b.timezone)) e[`${b.id}.timezone`] = "Choose a valid time zone.";
        text("note", b.note);
        b.days.forEach((d, i) => {
          if (d.closed) return;
          if (!TIME.test(d.open) || !TIME.test(d.close)) e[`${b.id}.day.${i}`] = `${DAY_NAMES[i]}: enter opening and closing times as hours and minutes.`;
          else if (d.open === d.close) e[`${b.id}.day.${i}`] = `${DAY_NAMES[i]}: opening and closing time are the same. Mark the day as closed instead.`;
        });
        break;
      }
      case "location": text("address", b.address); text("note", b.note); break;
      case "button":
        text("label", b.label);
        if (b.url && !websiteUrl(b.url)) e[`${b.id}.url`] = "Enter a website address such as example.com or https://example.com/page (no spaces).";
        else if (forPublish && (b.label || b.url) && !(b.label && b.url)) e[`${b.id}.${b.label ? "url" : "label"}`] = "A button needs both a label and an address.";
        break;
      case "file": {
        text("heading", b.heading); text("label", b.label); text("description", b.description);
        const link = httpsLink(b.url);
        if (b.fileId && b.url) e[`${b.id}.file`] = "Use either an uploaded PDF or a link, not both. Remove one.";
        else if (b.url && !link) e[`${b.id}.url`] = "Enter a link that starts with https:// (no spaces).";
        else if (forPublish && !b.fileId && !b.url) e[`${b.id}.file`] = "Upload a PDF or paste a link to the document.";
        break;
      }
      case "documents": {
        text("heading", b.heading);
        for (const it of b.items) {
          const k = `${b.id}.items.${it.id}`;
          if (CONTROL.test(it.title) || CONTROL.test(it.description)) e[k] = "Remove unsupported characters.";
          else if (it.fileId && it.url) e[k] = "Use either an uploaded PDF or a link for this document, not both.";
          else if (it.url && !httpsLink(it.url)) e[k] = "Enter a link that starts with https:// (no spaces).";
          else if (forPublish && (it.title || it.fileId || it.url) && !it.title) e[k] = "Give this document a title.";
          else if (forPublish && it.title && !it.fileId && !it.url) e[k] = "Upload a PDF or paste a link for this document.";
        }
        break;
      }
      case "gallery": {
        text("heading", b.heading);
        for (const it of b.items) {
          const k = `${b.id}.items.${it.id}`;
          if (CONTROL.test(it.caption) || CONTROL.test(it.alt)) e[k] = "Remove unsupported characters.";
          else if (forPublish && !it.imageId) e[k] = "This slot has no image. Upload one or remove it.";
          else if (forPublish && !it.alt) e[k] = "Describe this image in a few words for people who cannot see it (alt text).";
        }
        break;
      }
      case "entries": {
        text("heading", b.heading);
        for (const it of b.items) {
          const k = `${b.id}.items.${it.id}`;
          if ([it.title, it.org, it.period, it.summary].some((v) => CONTROL.test(v))) e[k] = "Remove unsupported characters.";
          else if (forPublish && (it.org || it.period || it.summary) && !it.title) e[k] = "Add a title for this entry (for example a job title or qualification).";
        }
        break;
      }
      case "items": {
        text("heading", b.heading);
        const noun = c.kind === "menu" ? "dish" : "product";
        for (const cat of b.categories) {
          const ck = `${b.id}.cat.${cat.id}`;
          if (CONTROL.test(cat.name)) e[ck] = "Remove unsupported characters.";
          else if (forPublish && !cat.name && b.categories.length > 1 && cat.items.some((i) => i.name)) e[ck] = "Name this category, or move its items to another one.";
          for (const it of cat.items) {
            const k = `${b.id}.items.${it.id}`;
            if ([it.name, it.description, it.price].some((v) => CONTROL.test(v))) e[k] = "Remove unsupported characters.";
            else if (it.price && parsePrice(it.price) === null) e[k] = "Enter the price as a number, for example 2500 or 2500.50. Leave it empty to show no price.";
            else if (forPublish && !it.name && (it.description || it.price || it.imageId)) e[k] = `Give this ${noun} a name, or remove it.`;
          }
        }
        break;
      }
      case "event": {
        const k = (f: string) => `${b.id}.${f}`;
        if (!validTimeZone(b.timezone)) e[k("timezone")] = "Choose a valid time zone, for example Africa/Lagos.";
        if (b.startsAt && !validLocalDateTime(b.startsAt)) e[k("startsAt")] = "Enter the start date and time.";
        if (b.endsAt && !validLocalDateTime(b.endsAt)) e[k("endsAt")] = "Enter the end date and time, or leave it empty.";
        if (!e[k("startsAt")] && !e[k("endsAt")] && !e[k("timezone")] && b.startsAt && b.endsAt) {
          const s0 = zonedToEpoch(b.startsAt, b.timezone), e0 = zonedToEpoch(b.endsAt, b.timezone);
          if (s0 !== null && e0 !== null && e0 <= s0) e[k("endsAt")] = "The end must be after the start.";
        }
        if (forPublish && !b.startsAt) e[k("startsAt")] = "Enter when the event starts.";
        break;
      }
      case "offer": {
        const k = (f: string) => `${b.id}.${f}`;
        text("title", b.title); text("description", b.description); text("conditions", b.conditions);
        if (b.code && !CODE_RE.test(b.code)) e[k("code")] = "Use 2 to 32 letters, numbers, dashes or underscores, with no spaces.";
        if (b.validFrom && !validDateOnly(b.validFrom)) e[k("validFrom")] = "Enter a valid start date, or leave it empty.";
        if (b.validUntil && !validDateOnly(b.validUntil)) e[k("validUntil")] = "Enter a valid end date, or leave it empty.";
        if (!e[k("validFrom")] && !e[k("validUntil")] && b.validFrom && b.validUntil && b.validUntil < b.validFrom) e[k("validUntil")] = "The last day must not be before the first day.";
        if (!validTimeZone(b.timezone)) e[k("timezone")] = "Choose a valid time zone, for example Africa/Lagos.";
        if (forPublish && !b.title && (b.code || b.description || b.validFrom || b.validUntil || b.conditions)) e[k("title")] = "Give this offer a title.";
        break;
      }
    }
  }
  if (forPublish && header?.type === "header") {
    const shown = publicBlocks(c).filter((b) => b.type !== "header");
    if (!shown.length) e.page = "Add some content people can use (contact details, a link, a profile or an introduction), then publish.";
    if (c.kind === "links" && !shown.some((b) => b.type === "links")) e.page = "Add at least one link before publishing a multi-link page.";
    if (c.kind === "social" && !shown.some((b) => b.type === "socials")) e.page = "Add at least one social profile before publishing.";
    if ((c.kind === "document" || c.kind === "presentation") && !shown.some((b) => b.type === "file")) e.page = c.kind === "document" ? "Add the document (an uploaded PDF or a link) before publishing." : "Add the slides (an uploaded PDF or a link) before publishing.";
    if (c.kind === "collection" && !shown.some((b) => b.type === "documents")) e.page = "Add at least one finished document (title and file or link) before publishing.";
    if (c.kind === "gallery" && !shown.some((b) => b.type === "gallery")) e.page = "Add at least one image before publishing.";
    if (c.kind === "menu" && !shown.some((b) => b.type === "items")) e.page = "Add at least one dish with a name before publishing.";
    if (c.kind === "product") {
      const cat = shown.find((b) => b.type === "items");
      if (!cat) e.page = "Add at least one product with a name before publishing.";
      else if (cat.type === "items" && !cat.enquiry) e.page = "Add a WhatsApp number (tick “WhatsApp button”) or an email address in Contact buttons, and show it on the page, so people can enquire about products.";
    }
    if (c.kind === "event" && !shown.some((b) => b.type === "event")) e.page = "Add the event date and time before publishing.";
    if (c.kind === "campaign" && !shown.some((b) => b.type === "button")) e.page = "Add a button (with a label and address) so visitors know what to do next.";
    if (c.kind === "coupon" && !shown.some((b) => b.type === "offer")) e.page = "Add at least one offer with a title before publishing.";
  }
  return e;
}
function dupes(blockId: string, group: string, list: CardRow[], key: (v: string) => string, e: BlockErrors, extra: (r: CardRow) => string = () => "") {
  const seen = new Map<string, number>();
  list.forEach((r, i) => {
    if (!r.value || e[`${blockId}.${group}.${r.id}`]) return;
    const k = extra(r) + "|" + key(r.value);
    if (seen.has(k)) e[`${blockId}.${group}.${r.id}`] = `This repeats entry ${seen.get(k)! + 1}.`;
    else seen.set(k, i);
  });
}

// ---------- the public snapshot ----------
export type PubRow = { id: string; label: string; text: string; href: string; whatsapp?: string | null };
export type PubBlock =
  | { id: string; type: "header"; name: string; tagline: string; portraitId: string | null; logoId: string | null; coverId: string | null }
  | { id: string; type: "text"; heading: string; body: string }
  | { id: string; type: "actions"; phones: PubRow[]; emails: PubRow[]; websites: PubRow[] }
  | { id: string; type: "links"; heading: string; items: { id: string; label: string; note: string; href: string }[] }
  | { id: string; type: "socials"; heading: string; items: PubRow[] }
  | { id: string; type: "hours"; timezone: string; days: DayHours[]; note: string }
  | { id: string; type: "location"; address: string; note: string; mapHref: string }
  | { id: string; type: "button"; label: string; href: string }
  | { id: string; type: "file"; heading: string; label: string; description: string; fileId: string | null; href: string | null; host: string | null; meta: FileMeta | null }
  | { id: string; type: "documents"; heading: string; items: PubDoc[] }
  | { id: string; type: "gallery"; heading: string; items: PubImage[] }
  | { id: string; type: "entries"; heading: string; items: EntryItem[] }
  | { id: string; type: "items"; heading: string; currency: Currency; categories: PubCategory[]; enquiry: Enquiry | null }
  | { id: string; type: "event"; startsAt: string; endsAt: string; timezone: string; online: boolean }
  | { id: string; type: "offer"; title: string; code: string; description: string; validFrom: string; validUntil: string; timezone: string; conditions: string };
export type PubItem = { id: string; name: string; description: string; price: number | null; imageId: string | null; w: number; h: number; status: ItemStatus; tags: Dietary[] };
export type PubCategory = { id: string; name: string; items: PubItem[] };
/** How a visitor can ask about a product: the page's first public WhatsApp number, else its first public email address. */
export type Enquiry = { whatsapp: string | null; email: string | null };
export type PubDoc = { id: string; title: string; description: string; fileId: string | null; href: string | null; host: string | null; meta: FileMeta | null };
export type PubImage = { id: string; imageId: string; caption: string; alt: string; w: number; h: number };
export type PageSnapshot = { v: 2; kind: BlockKind; accent: AccentId; blocks: PubBlock[] };

const str0 = (v: unknown) => (typeof v === "string" ? v : "");
const digits = (v: string) => v.replace(/\D/g, "");
const telHref = (v: string) => `tel:${v.trim().startsWith("+") ? "+" : ""}${digits(v)}`;
const clean = (x: string) => x.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
const hostOf = (u: string) => { try { return new URL(u).host; } catch { return null; } };
export const mapHref = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

function enquiryOf(c: PageContent): Enquiry | null {
  const a = c.blocks.find((b) => b.type === "actions" && !b.hidden);
  if (a?.type !== "actions") return null;
  const wa = a.phones.find((r) => r.public && r.whatsapp && r.value && !rowProblem("phones", r));
  const em = a.emails.find((r) => r.public && r.value && !rowProblem("emails", r));
  const whatsapp = wa ? digits(wa.value) : null;
  return whatsapp || em ? { whatsapp, email: em ? em.value.trim() : null } : null;
}

function publicBlocks(c: PageContent): PubBlock[] {
  const out: PubBlock[] = [];
  for (const b of c.blocks) {
    if (b.hidden && b.type !== "header") continue;
    switch (b.type) {
      case "header": out.push({ id: b.id, type: "header", name: b.name, tagline: b.tagline, portraitId: b.portraitId, logoId: b.logoId, coverId: b.coverId }); break;
      case "text": if (b.body && !CONTROL.test(b.body + b.heading)) out.push({ id: b.id, type: "text", heading: b.heading, body: b.body }); break;
      case "actions": {
        const ok = (g: "phones" | "emails" | "websites", l: CardRow[]) => l.filter((r) => r.public && r.value && !rowProblem(g, r));
        const phones = ok("phones", b.phones).map((r) => ({ id: r.id, label: r.label, text: r.value, href: telHref(r.value), whatsapp: r.whatsapp ? `https://wa.me/${digits(r.value)}` : null }));
        const emails = ok("emails", b.emails).map((r) => ({ id: r.id, label: r.label, text: r.value, href: `mailto:${r.value}` }));
        const websites = ok("websites", b.websites).flatMap((r) => { const u = websiteUrl(r.value); return u ? [{ id: r.id, label: r.label, text: clean(r.value), href: u }] : []; });
        if (phones.length || emails.length || websites.length) out.push({ id: b.id, type: "actions", phones, emails, websites });
        break;
      }
      case "links": {
        const items = b.items.flatMap((i) => { const u = websiteUrl(i.url); return u && i.label && !CONTROL.test(i.label + i.note) ? [{ id: i.id, label: i.label, note: i.note, href: u }] : []; });
        if (items.length) out.push({ id: b.id, type: "links", heading: b.heading, items });
        break;
      }
      case "socials": {
        const items = b.items.filter((r) => r.public && r.value && !rowProblem("socials", r)).flatMap((r) => { const u = socialUrl(r.label || "other", r.value); return u ? [{ id: r.id, label: r.label || "other", text: clean(r.value), href: u }] : []; });
        if (items.length) out.push({ id: b.id, type: "socials", heading: b.heading, items });
        break;
      }
      case "hours": if (validTimeZone(b.timezone) && b.days.some((d) => !d.closed && TIME.test(d.open) && TIME.test(d.close) && d.open !== d.close)) out.push({ id: b.id, type: "hours", timezone: b.timezone, days: b.days.map((d) => (d.closed || !TIME.test(d.open) || !TIME.test(d.close) || d.open === d.close ? { closed: true, open: "", close: "" } : d)), note: b.note }); break;
      case "location": if (b.address && !CONTROL.test(b.address + b.note)) out.push({ id: b.id, type: "location", address: b.address, note: b.note, mapHref: mapHref(b.address) }); break;
      case "button": { const u = websiteUrl(b.url); if (u && b.label && !CONTROL.test(b.label)) out.push({ id: b.id, type: "button", label: b.label, href: u }); break; }
      case "file": {
        const link = b.fileId ? null : httpsLink(b.url);
        const hosted = !!b.fileId && !!b.meta;
        if ((hosted || link) && !CONTROL.test(b.heading + b.label + b.description))
          out.push({ id: b.id, type: "file", heading: b.heading, label: b.label || "Download", description: b.description, fileId: hosted ? b.fileId : null, href: link, host: link ? hostOf(link) : null, meta: hosted ? b.meta : null });
        break;
      }
      case "documents": {
        const items = b.items.flatMap((i): PubDoc[] => {
          if (!i.title || CONTROL.test(i.title + i.description)) return [];
          const link = i.fileId ? null : httpsLink(i.url);
          const hosted = !!i.fileId && !!i.meta;
          return hosted || link ? [{ id: i.id, title: i.title, description: i.description, fileId: hosted ? i.fileId : null, href: link, host: link ? hostOf(link) : null, meta: hosted ? i.meta : null }] : [];
        });
        if (items.length) out.push({ id: b.id, type: "documents", heading: b.heading, items });
        break;
      }
      case "gallery": {
        const items = b.items.flatMap((i): PubImage[] => (i.imageId && i.meta && i.alt && !CONTROL.test(i.alt + i.caption) ? [{ id: i.id, imageId: i.imageId, caption: i.caption, alt: i.alt, w: i.meta.w, h: i.meta.h }] : []));
        if (items.length) out.push({ id: b.id, type: "gallery", heading: b.heading, items });
        break;
      }
      case "entries": {
        const items = b.items.filter((i) => i.title && ![i.title, i.org, i.period, i.summary].some((v) => CONTROL.test(v)));
        if (items.length) out.push({ id: b.id, type: "entries", heading: b.heading, items });
        break;
      }
      case "items": {
        const categories = b.categories.flatMap((cat): PubCategory[] => {
          if (CONTROL.test(cat.name)) return [];
          const items = cat.items.flatMap((i): PubItem[] => {
            if (!i.name || [i.name, i.description].some((v) => CONTROL.test(v))) return [];
            const price = i.price ? parsePrice(i.price) : null;
            if (i.price && price === null) return [];
            const img = i.imageId && i.meta ? i : null;
            return [{ id: i.id, name: i.name, description: i.description, price, imageId: img ? img.imageId : null, w: img?.meta?.w ?? 0, h: img?.meta?.h ?? 0, status: i.status, tags: i.tags }];
          });
          return items.length ? [{ id: cat.id, name: cat.name, items }] : [];
        });
        if (categories.length) out.push({ id: b.id, type: "items", heading: b.heading, currency: b.currency, categories, enquiry: c.kind === "product" ? enquiryOf(c) : null });
        break;
      }
      case "event":
        if (validLocalDateTime(b.startsAt) && validTimeZone(b.timezone)) {
          const endOk = b.endsAt && validLocalDateTime(b.endsAt) && (zonedToEpoch(b.endsAt, b.timezone) ?? 0) > (zonedToEpoch(b.startsAt, b.timezone) ?? 0);
          out.push({ id: b.id, type: "event", startsAt: b.startsAt, endsAt: endOk ? b.endsAt : "", timezone: b.timezone, online: b.online });
        }
        break;
      case "offer": {
        const okDates = (!b.validFrom || validDateOnly(b.validFrom)) && (!b.validUntil || validDateOnly(b.validUntil)) && (!b.validFrom || !b.validUntil || b.validUntil >= b.validFrom);
        if (b.title && okDates && validTimeZone(b.timezone) && (!b.code || CODE_RE.test(b.code)) && ![b.title, b.description, b.conditions].some((v) => CONTROL.test(v)))
          out.push({ id: b.id, type: "offer", title: b.title, code: b.code, description: b.description, validFrom: b.validFrom, validUntil: b.validUntil, timezone: b.timezone, conditions: b.conditions });
        break;
      }
    }
  }
  return out;
}
export const snapshotOfContent = (c: PageContent): PageSnapshot => ({ v: 2, kind: c.kind, accent: c.accent, blocks: publicBlocks(c) });

/** Read a stored snapshot defensively: a damaged row loses itself, never the page. */
export function readPageSnapshot(raw: unknown): PageSnapshot | null {
  const o = obj(raw);
  if (!o || o.v !== 2 || !isBlockKind(o.kind)) return null;
  const blocks = arr(o.blocks).filter((b): b is PubBlock => { const x = obj(b); return !!x && typeof x.id === "string" && typeof x.type === "string"; });
  const head = blocks.find((b) => b.type === "header");
  if (!head) return null;
  const rowsOk = (l: unknown) => arr(l).filter((r): r is PubRow => { const x = obj(r); return !!x && typeof x.id === "string" && typeof x.text === "string" && typeof x.href === "string"; });
  const safe = blocks.flatMap((b): PubBlock[] => {
    switch (b.type) {
      case "actions": return [{ ...b, phones: rowsOk(b.phones), emails: rowsOk(b.emails), websites: rowsOk(b.websites) }];
      case "socials": return [{ ...b, items: rowsOk(b.items) }];
      case "links": return [{ ...b, items: arr(b.items).filter((i): i is { id: string; label: string; note: string; href: string } => { const x = obj(i); return !!x && typeof x.href === "string" && typeof x.label === "string"; }) }];
      case "hours": return Array.isArray(b.days) && b.days.length === 7 && typeof b.timezone === "string" ? [b] : [];
      case "location": return typeof b.mapHref === "string" && typeof b.address === "string" ? [b] : [];
      case "button": return typeof b.href === "string" && typeof b.label === "string" ? [b] : [];
      case "header": return [{ ...b, coverId: typeof b.coverId === "string" ? b.coverId : null }];
      case "text": return [b];
      case "file": return typeof b.label === "string" && (typeof b.href === "string" || typeof b.fileId === "string") ? [{ ...b, heading: str0(b.heading), description: str0(b.description), meta: b.meta ?? null, fileId: b.fileId ?? null, href: b.href ?? null, host: b.host ?? null }] : [];
      case "documents": return [{ ...b, items: arr(b.items).filter((i): i is PubDoc => { const x = obj(i); return !!x && typeof x.title === "string" && (typeof x.href === "string" || typeof x.fileId === "string"); }).map((i) => ({ ...i, description: str0(i.description), meta: i.meta ?? null, fileId: i.fileId ?? null, href: i.href ?? null, host: i.host ?? null })) }];
      case "gallery": return [{ ...b, items: arr(b.items).filter((i): i is PubImage => { const x = obj(i); return !!x && typeof x.imageId === "string" && typeof x.alt === "string" && typeof x.w === "number" && typeof x.h === "number"; }).map((i) => ({ ...i, caption: str0(i.caption) })) }];
      case "entries": return [{ ...b, items: arr(b.items).filter((i): i is EntryItem => { const x = obj(i); return !!x && typeof x.title === "string"; }).map((i) => ({ ...i, org: str0(i.org), period: str0(i.period), summary: str0(i.summary) })) }];
      case "items": return [{ ...b, heading: str0(b.heading), currency: isCurrency(b.currency) ? b.currency : "NGN", enquiry: b.enquiry && typeof b.enquiry === "object" ? { whatsapp: typeof b.enquiry.whatsapp === "string" ? b.enquiry.whatsapp : null, email: typeof b.enquiry.email === "string" ? b.enquiry.email : null } : null,
        categories: arr(b.categories).flatMap((cat): PubCategory[] => { const x = obj(cat); if (!x || typeof x.id !== "string") return [];
          const items = arr(x.items).flatMap((i): PubItem[] => { const y = obj(i); return y && typeof y.id === "string" && typeof y.name === "string"
            ? [{ id: y.id, name: y.name, description: str0(y.description), price: typeof y.price === "number" ? y.price : null, imageId: typeof y.imageId === "string" ? y.imageId : null, w: typeof y.w === "number" ? y.w : 0, h: typeof y.h === "number" ? y.h : 0, status: isStatus(y.status) ? y.status : "available", tags: arr(y.tags).filter(isDietary) }] : []; });
          return [{ id: x.id, name: str0(x.name), items }]; }) }];
      case "event": return typeof b.startsAt === "string" && typeof b.timezone === "string" ? [{ ...b, endsAt: str0(b.endsAt), online: b.online === true }] : [];
      case "offer": return typeof b.title === "string" ? [{ ...b, code: str0(b.code), description: str0(b.description), validFrom: str0(b.validFrom), validUntil: str0(b.validUntil), timezone: str0(b.timezone) || DEFAULT_TZ, conditions: str0(b.conditions) }] : [];
      default: return [];
    }
  });
  return { v: 2, kind: o.kind, accent: ACCENTS.some((a) => a.id === o.accent) ? (o.accent as AccentId) : "forest", blocks: safe };
}

export type MediaRef = { id: string; kind: "portrait" | "logo" | "image" | "file" };
/** Every stored file the draft references, with the kind each slot requires. */
export function contentMedia(c: PageContent): MediaRef[] {
  const out: MediaRef[] = [];
  for (const b of c.blocks) {
    if (b.type === "header") { if (b.portraitId) out.push({ id: b.portraitId, kind: "portrait" }); if (b.logoId) out.push({ id: b.logoId, kind: "logo" }); if (b.coverId) out.push({ id: b.coverId, kind: "image" }); }
    else if (b.type === "file") { if (b.fileId) out.push({ id: b.fileId, kind: "file" }); }
    else if (b.type === "documents") { for (const i of b.items) if (i.fileId) out.push({ id: i.fileId, kind: "file" }); }
    else if (b.type === "gallery") { for (const i of b.items) if (i.imageId) out.push({ id: i.imageId, kind: "image" }); }
    else if (b.type === "items") { for (const cat of b.categories) for (const i of cat.items) if (i.imageId) out.push({ id: i.imageId, kind: "image" }); }
  }
  return out;
}
/** Same, from a stored snapshot. */
export function snapshotMediaIds(s: PageSnapshot): string[] {
  const out: string[] = [];
  for (const b of s.blocks) {
    if (b.type === "header") out.push(...[b.portraitId, b.logoId, b.coverId].filter((x): x is string => !!x));
    else if (b.type === "file") { if (b.fileId) out.push(b.fileId); }
    else if (b.type === "documents") { for (const i of b.items) if (i.fileId) out.push(i.fileId); }
    else if (b.type === "gallery") out.push(...b.items.map((i) => i.imageId));
    else if (b.type === "items") { for (const cat of b.categories) for (const i of cat.items) if (i.imageId) out.push(i.imageId); }
  }
  return out;
}
export type StoredFile = { kind: string; bytes: number; mime: string; width: number | null; height: number | null; name: string | null; pages: number | null };
/** Set every file's facts from its stored record (the browser's copy is never trusted). Unknown ids lose their facts. */
export function withStoredFacts(c: PageContent, by: Map<string, StoredFile>): PageContent {
  const fm = (id: string | null): FileMeta | null => { const f = id ? by.get(id) : null; return f && f.kind === "file" ? { name: f.name ?? "document.pdf", bytes: f.bytes, pages: f.pages, mime: f.mime } : null; };
  const im = (id: string | null): ImgMeta | null => { const f = id ? by.get(id) : null; return f && f.kind === "image" && f.width && f.height ? { w: f.width, h: f.height } : null; };
  return { ...c, blocks: c.blocks.map((b): Block => {
    if (b.type === "file") return { ...b, meta: fm(b.fileId) };
    if (b.type === "documents") return { ...b, items: b.items.map((i) => ({ ...i, meta: fm(i.fileId) })) };
    if (b.type === "gallery") return { ...b, items: b.items.map((i) => ({ ...i, meta: im(i.imageId) })) };
    if (b.type === "items") return { ...b, categories: b.categories.map((cat) => ({ ...cat, items: cat.items.map((i) => ({ ...i, meta: im(i.imageId) })) })) };
    return b;
  }) };
}
/** Drop references to files that no longer exist (restoring an old version). */
export function withoutMissingMedia(c: PageContent, have: Set<string>): PageContent {
  const k = (id: string | null) => (id && have.has(id) ? id : null);
  return { ...c, blocks: c.blocks.map((b): Block => {
    if (b.type === "header") return { ...b, portraitId: k(b.portraitId), logoId: k(b.logoId), coverId: k(b.coverId) };
    if (b.type === "file") return { ...b, fileId: k(b.fileId), meta: k(b.fileId) ? b.meta : null };
    if (b.type === "documents") return { ...b, items: b.items.map((i) => ({ ...i, fileId: k(i.fileId), meta: k(i.fileId) ? i.meta : null })) };
    if (b.type === "gallery") return { ...b, items: b.items.filter((i) => k(i.imageId)) };
    if (b.type === "items") return { ...b, categories: b.categories.map((cat) => ({ ...cat, items: cat.items.map((i) => ({ ...i, imageId: k(i.imageId), meta: k(i.imageId) ? i.meta : null })) })) };
    return b;
  }) };
}

/** Organisation contact file (vCard 3.0 data) for business pages. Public details only; never a photo. */
export function orgContact(s: PageSnapshot): { name: string; phones: string[]; emails: string[]; urls: string[]; address: string } | null {
  const head = s.blocks.find((b) => b.type === "header");
  if (head?.type !== "header") return null;
  const a = s.blocks.find((b) => b.type === "actions");
  const loc = s.blocks.find((b) => b.type === "location");
  const phones = a?.type === "actions" ? a.phones.map((p) => p.text.trim()) : [];
  const emails = a?.type === "actions" ? a.emails.map((p) => p.text) : [];
  const urls = [...(a?.type === "actions" ? a.websites.map((p) => p.href) : []), ...s.blocks.flatMap((b) => (b.type === "socials" ? b.items.map((i) => i.href) : []))];
  const address = loc?.type === "location" ? loc.address : "";
  return phones.length || emails.length || urls.length || address ? { name: head.name, phones, emails, urls, address } : null;
}

/** The downloadable contact file for a business page (vCard 3.0). Public details only; no photo. */
export function orgVcf(s: PageSnapshot): string | null {
  const o = orgContact(s);
  if (!o || !o.name) return null;
  const row = (t: string, i: number) => ({ id: String(i), label: "work", text: t, href: "" });
  return buildVcf({
    v: 1, name: o.name, role: "", company: o.name, intro: "", accent: s.accent, portraitId: null, logoId: null,
    phones: o.phones.map((t, i) => ({ ...row(t, i), whatsapp: null })), emails: o.emails.map(row),
    websites: o.urls.map((u, i) => ({ id: String(i), label: "", text: u, href: u })), socials: [],
  }, null, { org: true, address: o.address });
}
