/**
 * One interface over every hosted page kind, so the routes (create, save, publish, restore, media, public view) stay kind-agnostic.
 * "card" keeps its original model (lib/pages/card.ts); every other kind is built from sections (lib/pages/blocks.ts).
 */
import { cardFromSnapshot, emptyCard, normaliseCard, readSnapshot, snapshotOf, validateCard, type Card } from "@/lib/pages/card";
import {
  BLOCK_KINDS, KIND_INFO, contentMedia, emptyContent, isBlockKind, normaliseContent, readPageSnapshot, snapshotMediaIds, snapshotOfContent, validateContent, withoutMissingMedia,
  newBlockId, withStoredFacts, type Block, type BlockKind, type PageContent, type PageSnapshot, type StoredFile,
} from "@/lib/pages/blocks";

export type PageKind = "card" | BlockKind;
export const PAGE_KINDS: PageKind[] = ["card", ...BLOCK_KINDS];
export const isPageKind = (k: unknown): k is PageKind => k === "card" || isBlockKind(k);
export const kindLabel = (k: string) => (k === "card" ? "Digital business card" : isBlockKind(k) ? KIND_INFO[k].label : k);
export type MediaRef = { id: string; kind: "portrait" | "logo" | "image" | "file" };

export type Engine = {
  empty(): unknown;
  normalise(raw: unknown): unknown;
  validate(content: unknown, forPublish: boolean): Record<string, string>;
  snapshot(content: unknown): unknown;
  readSnapshot(raw: unknown): unknown | null;
  mediaRefs(content: unknown): MediaRef[];
  snapshotMedia(snapshot: unknown): string[];
  fromSnapshot(snapshot: unknown): unknown;
  /** Drop references to files that no longer exist (used when restoring an old version). */
  withoutMissing(content: unknown, have: Set<string>): unknown;
  /** Set file facts (name, size, pages, dimensions) from the stored records. Section pages only. */
  withFacts?(content: unknown, by: Map<string, StoredFile>): unknown;
  /** Which stored file kinds this page type may upload. */
  uploads: MediaRef["kind"][];
};

const cardEngine: Engine = {
  empty: emptyCard,
  normalise: normaliseCard,
  validate: (c, p) => validateCard(c as Card, p),
  snapshot: (c) => snapshotOf(c as Card),
  readSnapshot,
  mediaRefs: (c) => { const k = c as Card; return [...(k.portraitId ? [{ id: k.portraitId, kind: "portrait" as const }] : []), ...(k.logoId ? [{ id: k.logoId, kind: "logo" as const }] : [])]; },
  snapshotMedia: (s) => { const x = s as { portraitId?: string | null; logoId?: string | null }; return [x.portraitId, x.logoId].filter((v): v is string => !!v); },
  fromSnapshot: (s) => cardFromSnapshot(s as Parameters<typeof cardFromSnapshot>[0]),
  uploads: ["portrait", "logo"],
  withoutMissing: (c, have) => { const k = { ...(c as Card) }; if (k.portraitId && !have.has(k.portraitId)) k.portraitId = null; if (k.logoId && !have.has(k.logoId)) k.logoId = null; return k; },
};

function blocksEngine(kind: BlockKind): Engine {
  return {
    empty: () => emptyContent(kind),
    normalise: (raw) => normaliseContent(kind, raw),
    validate: (c, p) => validateContent(c as PageContent, p),
    snapshot: (c) => snapshotOfContent(c as PageContent),
    readSnapshot: readPageSnapshot,
    mediaRefs: (c) => contentMedia(c as PageContent),
    snapshotMedia: (s) => snapshotMediaIds(s as PageSnapshot),
    fromSnapshot: (s) => fromPageSnapshot(kind, s as PageSnapshot),
    withoutMissing: (c, have) => withoutMissingMedia(c as PageContent, have),
    withFacts: (c, by) => withStoredFacts(c as PageContent, by),
    uploads: [...(KIND_INFO[kind].portrait ? ["portrait" as const] : []), ...(KIND_INFO[kind].logo ? ["logo" as const] : []),
      ...(KIND_INFO[kind].cover || KIND_INFO[kind].allow.includes("gallery") ? ["image" as const] : []),
      ...(KIND_INFO[kind].allow.includes("file") || KIND_INFO[kind].allow.includes("documents") ? ["file" as const] : [])],
  };
}

export function engineFor(kind: string): Engine | null {
  if (kind === "card") return cardEngine;
  return isBlockKind(kind) ? blocksEngine(kind) : null;
}

/** A revision keeps only what was public, so a restored draft contains only that. */
function fromPageSnapshot(kind: BlockKind, s: PageSnapshot): PageContent {
  const blocks: Block[] = s.blocks.map((b): Block => {
    const base = { id: b.id, hidden: false };
    switch (b.type) {
      case "header": return { ...base, type: "header", name: b.name, tagline: b.tagline, portraitId: b.portraitId, logoId: b.logoId, coverId: b.coverId };
      case "text": return { ...base, type: "text", heading: b.heading, body: b.body };
      case "actions": return { ...base, type: "actions",
        phones: b.phones.map((r) => ({ id: r.id, label: r.label, value: r.text, public: true, whatsapp: !!r.whatsapp })),
        emails: b.emails.map((r) => ({ id: r.id, label: r.label, value: r.text, public: true })),
        websites: b.websites.map((r) => ({ id: r.id, label: r.label, value: r.href, public: true })) };
      case "links": return { ...base, type: "links", heading: b.heading, items: b.items.map((i) => ({ id: i.id, label: i.label, url: i.href, note: i.note })) };
      case "socials": return { ...base, type: "socials", heading: b.heading, items: b.items.map((r) => ({ id: r.id, label: r.label, value: r.href, public: true })) };
      case "hours": return { ...base, type: "hours", timezone: b.timezone, days: b.days.map((d) => (d.closed ? { closed: true, open: "09:00", close: "17:00" } : d)), note: b.note };
      case "location": return { ...base, type: "location", address: b.address, note: b.note };
      case "button": return { ...base, type: "button", label: b.label, url: b.href };
      case "file": return { ...base, type: "file", heading: b.heading, label: b.label, description: b.description, fileId: b.fileId, url: b.href ?? "", meta: b.meta };
      case "documents": return { ...base, type: "documents", heading: b.heading, items: b.items.map((i) => ({ id: i.id, title: i.title, description: i.description, fileId: i.fileId, url: i.href ?? "", meta: i.meta })) };
      case "gallery": return { ...base, type: "gallery", heading: b.heading, items: b.items.map((i) => ({ id: i.id, imageId: i.imageId, caption: i.caption, alt: i.alt, meta: { w: i.w, h: i.h } })) };
      case "entries": return { ...base, type: "entries", heading: b.heading, items: b.items };
    }
  });
  return normaliseContent(kind, { v: 2, kind, accent: s.accent, blocks: blocks.map((b) => ({ ...b, id: b.id || newBlockId() })) });
}
