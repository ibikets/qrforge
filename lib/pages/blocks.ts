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

export type BlockKind = "business" | "links" | "social";
export type BlockType = "header" | "text" | "actions" | "links" | "socials" | "hours" | "location" | "button";

export type LinkItem = { id: string; label: string; url: string; note: string };
export type DayHours = { closed: boolean; open: string; close: string };
type Common = { id: string; hidden: boolean };
export type Block =
  | (Common & { type: "header"; name: string; tagline: string; portraitId: string | null; logoId: string | null })
  | (Common & { type: "text"; heading: string; body: string })
  | (Common & { type: "actions"; phones: CardRow[]; emails: CardRow[]; websites: CardRow[] })
  | (Common & { type: "links"; heading: string; items: LinkItem[] })
  | (Common & { type: "socials"; heading: string; items: CardRow[] })
  | (Common & { type: "hours"; timezone: string; days: DayHours[]; note: string })
  | (Common & { type: "location"; address: string; note: string })
  | (Common & { type: "button"; label: string; url: string });
export type PageContent = { v: 2; kind: BlockKind; accent: AccentId; blocks: Block[] };
export type BlockErrors = Record<string, string>;

export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const MAX_BLOCKS = 20;
export const MAX_LINKS = 30;
export const MAX_SOCIALS = 12;
export const MAX_ACTION_ROWS = 10;

export type KindInfo = {
  label: string; blurb: string; titleHint: string;
  portrait: boolean; logo: boolean; tagline: string;
  allow: Exclude<BlockType, "header">[];
  start: Exclude<BlockType, "header">[];
  max: Partial<Record<BlockType, number>>;
};
export const BLOCK_KINDS: BlockKind[] = ["business", "links", "social"];
export const KIND_INFO: Record<BlockKind, KindInfo> = {
  business: {
    label: "Business page", titleHint: "e.g. Acme Ltd – main page",
    blurb: "Who you are, when you are open, where to find you and how to reach you. Call, WhatsApp, email and directions in one place.",
    portrait: true, logo: true, tagline: "What you do, in a few words",
    allow: ["text", "actions", "hours", "location", "links", "socials", "button"],
    start: ["text", "actions", "hours", "location", "socials"],
    max: { header: 1, actions: 1, hours: 1, location: 1, socials: 1, text: 3, links: 3, button: 5 },
  },
  links: {
    label: "Multi-link page", titleHint: "e.g. Ada – links",
    blurb: "One address that opens a tidy list of your most important links, in the order you choose.",
    portrait: true, logo: true, tagline: "A line about you or your brand",
    allow: ["links", "socials", "text", "button"],
    start: ["links", "socials"],
    max: { header: 1, socials: 1, text: 3, links: 3, button: 5 },
  },
  social: {
    label: "Social profile page", titleHint: "e.g. Ada – socials",
    blurb: "All your social profiles on one page, with a short line about you. Profiles are built from handles, so they stay correct.",
    portrait: true, logo: false, tagline: "A line about you",
    allow: ["socials", "links", "text"],
    start: ["socials"],
    max: { header: 1, socials: 1, text: 2, links: 1 },
  },
};
export const isBlockKind = (k: unknown): k is BlockKind => typeof k === "string" && (BLOCK_KINDS as string[]).includes(k);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = /^[a-z0-9_-]{1,24}$/i;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const newBlockId = () => "b" + Math.random().toString(36).slice(2, 10);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim().slice(0, max) : "");
const media = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v.toLowerCase() : null);

export function validTimeZone(tz: string): boolean {
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); return tz.length > 0 && tz.length <= 64; } catch { return false; }
}
export const DEFAULT_TZ = "Africa/Lagos";
export const defaultDays = (): DayHours[] => Array.from({ length: 7 }, (_, i) => ({ closed: i === 6, open: "09:00", close: "17:00" }));

export function emptyBlock(type: BlockType): Block {
  const c = { id: newBlockId(), hidden: false };
  switch (type) {
    case "header": return { ...c, type, name: "", tagline: "", portraitId: null, logoId: null };
    case "text": return { ...c, type, heading: "About", body: "" };
    case "actions": return { ...c, type, phones: [{ id: newRowId(), label: "mobile", value: "", public: true, whatsapp: false }], emails: [{ id: newRowId(), label: "work", value: "", public: true }], websites: [{ id: newRowId(), label: "", value: "", public: true }] };
    case "links": return { ...c, type, heading: "Links", items: [{ id: newRowId(), label: "", url: "", note: "" }] };
    case "socials": return { ...c, type, heading: "", items: [{ id: newRowId(), label: "instagram", value: "", public: true }] };
    case "hours": return { ...c, type, timezone: DEFAULT_TZ, days: defaultDays(), note: "" };
    case "location": return { ...c, type, address: "", note: "" };
    case "button": return { ...c, type, label: "", url: "" };
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
    case "header": return { ...c, type: "header", name: str(o.name, 80), tagline: str(o.tagline, 120), portraitId: media(o.portraitId), logoId: media(o.logoId) };
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
    default: return null;
  }
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
    if (b.type === "header") { if (!header) header = { ...b, hidden: false, portraitId: info.portrait ? b.portraitId : null, logoId: info.logo ? b.logoId : null }; continue; }
    if (!info.allow.includes(b.type)) continue;
    counts[b.type] = (counts[b.type] ?? 0) + 1;
    if (counts[b.type]! > (info.max[b.type] ?? 1)) continue;
    if (rest.length < MAX_BLOCKS - 1) rest.push(b);
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
    }
  }
  if (forPublish && header?.type === "header") {
    const shown = publicBlocks(c).filter((b) => b.type !== "header");
    if (!shown.length) e.page = "Add some content people can use (contact details, a link, a profile or an introduction), then publish.";
    if (c.kind === "links" && !shown.some((b) => b.type === "links")) e.page = "Add at least one link before publishing a multi-link page.";
    if (c.kind === "social" && !shown.some((b) => b.type === "socials")) e.page = "Add at least one social profile before publishing.";
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
  | { id: string; type: "header"; name: string; tagline: string; portraitId: string | null; logoId: string | null }
  | { id: string; type: "text"; heading: string; body: string }
  | { id: string; type: "actions"; phones: PubRow[]; emails: PubRow[]; websites: PubRow[] }
  | { id: string; type: "links"; heading: string; items: { id: string; label: string; note: string; href: string }[] }
  | { id: string; type: "socials"; heading: string; items: PubRow[] }
  | { id: string; type: "hours"; timezone: string; days: DayHours[]; note: string }
  | { id: string; type: "location"; address: string; note: string; mapHref: string }
  | { id: string; type: "button"; label: string; href: string };
export type PageSnapshot = { v: 2; kind: BlockKind; accent: AccentId; blocks: PubBlock[] };

const digits = (v: string) => v.replace(/\D/g, "");
const telHref = (v: string) => `tel:${v.trim().startsWith("+") ? "+" : ""}${digits(v)}`;
const clean = (x: string) => x.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
export const mapHref = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

function publicBlocks(c: PageContent): PubBlock[] {
  const out: PubBlock[] = [];
  for (const b of c.blocks) {
    if (b.hidden && b.type !== "header") continue;
    switch (b.type) {
      case "header": out.push({ id: b.id, type: "header", name: b.name, tagline: b.tagline, portraitId: b.portraitId, logoId: b.logoId }); break;
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
      case "header": case "text": return [b];
      default: return [];
    }
  });
  return { v: 2, kind: o.kind, accent: ACCENTS.some((a) => a.id === o.accent) ? (o.accent as AccentId) : "forest", blocks: safe };
}

/** Media ids the draft references, with the kind each must have. */
export function contentMedia(c: PageContent): { id: string; kind: "portrait" | "logo" | "image" | "file" }[] {
  const h = c.blocks[0];
  return h?.type === "header" ? [...(h.portraitId ? [{ id: h.portraitId, kind: "portrait" as const }] : []), ...(h.logoId ? [{ id: h.logoId, kind: "logo" as const }] : [])] : [];
}
/** Same, from a stored snapshot. */
export function snapshotMediaIds(s: PageSnapshot): string[] {
  const h = s.blocks.find((b) => b.type === "header");
  return h?.type === "header" ? [h.portraitId, h.logoId].filter((x): x is string => !!x) : [];
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
