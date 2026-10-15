import { isCurrency } from "@/lib/pages/items";
import type { ImportKind, Table } from "@/lib/import/table";

/**
 * Candidate menu or catalogue items from ONE public web page, read only from structured data the site itself publishes
 * (schema.org JSON-LD: Product, MenuItem, Menu/MenuSection, ItemList, @graph, plus the Open Graph product tags). Nothing is guessed from page layout:
 * a missing price, availability or category stays blank and is flagged for the owner. Pure and bounded; the page text is untrusted data.
 */
export type Candidate = { ref: string; category: string; name: string; description: string; price: string; currency: string; status: string; link: string; imageUrl: string; notes: string[] };
export type Extracted = { candidates: Candidate[]; notes: string[]; structuredBlocks: number };
const MAX_BLOCKS = 30, MAX_BLOCK_CHARS = 500_000, MAX_NODES = 20_000, MAX_CANDIDATES = 100, MAX_DEPTH = 8;

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", hellip: "…", pound: "£", euro: "€", naira: "₦" };
export const plain = (s: unknown, max = 5000): string => {
  if (typeof s === "number") return String(s);
  if (typeof s !== "string") return "";
  return s.slice(0, max * 2).replace(/<\s*br\s*\/?\s*>|<\/(p|div|li|h\d)>/gi, " ").replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => { if (e[0] === "#") { const cp = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return cp > 31 && cp < 0x110000 && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : cp === 9 || cp === 10 || cp === 13 ? " " : ""; } return ENT[e.toLowerCase()] ?? m; })
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
};
const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
const typesOf = (n: Record<string, unknown>) => arr(n["@type"]).map((t) => String(t).replace(/^.*[/#]/, "").toLowerCase());
const get = (n: Record<string, unknown>, k: string): unknown => (Object.prototype.hasOwnProperty.call(n, k) ? n[k] : undefined);
const absUrl = (raw: unknown, base: string): string => {
  const s = typeof raw === "string" ? raw.trim() : rec(raw) && typeof get(rec(raw)!, "url") === "string" ? (get(rec(raw)!, "url") as string).trim() : "";
  if (!s || s.length > 2000) return "";
  try { const u = new URL(s, base); return u.protocol === "https:" && !u.username && !u.password ? u.href : ""; } catch { return ""; }
};
const firstImage = (v: unknown, base: string): string => { for (const x of arr(v).slice(0, 5)) { const u = absUrl(x, base); if (u) return u; } return ""; };
const STATUS: Record<string, string> = { instock: "Available", instoreonly: "Available", onlineonly: "Available", limitedavailability: "Limited", outofstock: "Sold out", soldout: "Sold out", discontinued: "Sold out", preorder: "Pre-order", presale: "Pre-order", backorder: "Pre-order" };

type Offer = { price: string; currency: string; status: string; url: string; notes: string[] };
function offerOf(v: unknown, base: string): Offer {
  const o: Offer = { price: "", currency: "", status: "", url: "", notes: [] };
  const list = arr(v).map(rec).filter((x): x is Record<string, unknown> => !!x).slice(0, 20);
  if (!list.length) return o;
  const prices = new Set<string>(); let cur = "";
  for (const x of list) {
    const types = typesOf(x);
    const p = get(x, "price") ?? (types.includes("aggregateoffer") ? undefined : get(x, "lowPrice"));
    if (p !== undefined && p !== null && String(p).trim() !== "") prices.add(String(p).trim());
    else if (types.includes("aggregateoffer") && get(x, "lowPrice") !== undefined) prices.add("RANGE");
    const c = plain(get(x, "priceCurrency"), 5).toUpperCase(); if (c && !cur) cur = c;
    if (!o.status) { const a = plain(get(x, "availability"), 100).replace(/^.*[/#]/, "").toLowerCase(); if (STATUS[a]) o.status = STATUS[a]; }
    if (!o.url) o.url = absUrl(get(x, "url"), base);
  }
  if (prices.size === 1 && ![...prices][0].includes("RANGE")) o.price = [...prices][0]; else if (prices.size > 1 || prices.has("RANGE")) o.notes.push("Several prices or a price range were published, so no price was imported. Enter it yourself.");
  o.currency = cur; return o;
}

export function extractCandidates(html: string, pageUrl: string, kind: ImportKind): Extracted {
  const notes: string[] = []; const out: Candidate[] = []; const seen = new Set<string>(); let blocks = 0, nodes = 0, overflow = false;
  const accepts = (types: string[]) => (kind === "menu" ? types.includes("menuitem") || types.includes("product") : types.includes("product"));
  const visit = (n: unknown, ctx: { category: string }, depth: number) => {
    if (overflow || depth > MAX_DEPTH || ++nodes > MAX_NODES) { if (nodes > MAX_NODES) overflow = true; return; }
    if (Array.isArray(n)) { for (const x of n.slice(0, 2000)) visit(x, ctx, depth + 1); return; }
    const o = rec(n); if (!o) return;
    const types = typesOf(o); let c = ctx;
    if (types.includes("menusection")) { const nm = plain(get(o, "name"), 60); if (nm) c = { category: nm }; }
    if (types.includes("listitem") && rec(get(o, "item"))) { visit(get(o, "item"), c, depth + 1); }
    if (accepts(types) && plain(get(o, "name"), 200)) {
      if (out.length >= MAX_CANDIDATES) { overflow = true; return; }
      const notesC: string[] = [];
      const name = plain(get(o, "name"), 200), desc = plain(get(o, "description"), 2000);
      const sku = plain(get(o, "sku") ?? get(o, "productID"), 60);
      const of = offerOf(get(o, "offers"), pageUrl); notesC.push(...of.notes);
      let cat = c.category || plain(get(o, "category"), 120); if (cat.includes(">")) cat = cat.split(">").pop()!.trim(); if (cat.includes("/") && /^[\w\s/&-]+$/.test(cat)) cat = cat.split("/").pop()!.trim();
      const key = (sku || name).toLowerCase();
      if (seen.has(key)) return; seen.add(key);
      if (!of.price && !of.notes.length) notesC.push("No price was published on the page.");
      if (!of.status) notesC.push("Availability was not published; it will be set to Available unless you change it.");
      if (!cat) notesC.push("No category was published.");
      if (kind === "product" && types.includes("productgroup")) notesC.push("This product has variants; they were not imported.");
      if (of.status === "Pre-order" && kind === "menu") { of.status = ""; notesC.push("Pre-order does not apply to menus."); }
      out.push({ ref: sku && /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(sku) ? sku : "", category: cat, name, description: desc, price: of.price, currency: of.currency, status: of.status, link: kind === "product" ? absUrl(get(o, "url"), pageUrl) || of.url || absUrl(pageUrl, pageUrl) : "", imageUrl: firstImage(get(o, "image"), pageUrl), notes: notesC });
      if (sku && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(sku)) out[out.length - 1].notes.push("The product code on the page isn’t usable as an item code, so none was set.");
    }
    for (const k of ["@graph", "hasMenuSection", "hasMenuItem", "itemListElement", "hasVariant", "mainEntity", "hasPart", "hasMenu", "makesOffer"]) { const v = get(o, k); if (v !== undefined) visit(v, c, depth + 1); }
  };
  for (const m of html.slice(0, 6_000_000).matchAll(/<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (blocks >= MAX_BLOCKS) { notes.push("Only the first 30 structured-data blocks on the page were read."); break; }
    const raw = m[1].trim().replace(/^<!--|-->$/g, "").replace(/^\s*\/\/<!\[CDATA\[|\/\/\]\]>\s*$/g, "");
    if (raw.length > MAX_BLOCK_CHARS) { notes.push("One structured-data block was too large and was skipped."); continue; }
    try { blocks++; visit(JSON.parse(raw), { category: "" }, 0); } catch { notes.push("One structured-data block on the page was not valid and was skipped."); }
  }
  if (!out.length) { // Open Graph product tags: a single product page
    const meta = (p: string) => { const r = new RegExp(`<meta\\b[^>]*\\b(?:property|name)\\s*=\\s*["']${p.replace(/[:.]/g, "\\$&")}["'][^>]*>`, "i").exec(html); const c = r && /\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i.exec(r[0]); return c ? plain(c[1] ?? c[2], 2000) : ""; };
    if (kind === "product" && /^(og:)?product/i.test(meta("og:type")) && meta("og:title")) {
      const cur = meta("product:price:currency").toUpperCase(); const price = meta("product:price:amount");
      out.push({ ref: "", category: "", name: meta("og:title"), description: meta("og:description"), price, currency: cur, status: "", link: absUrl(meta("og:url"), pageUrl) || absUrl(pageUrl, pageUrl), imageUrl: absUrl(meta("og:image"), pageUrl), notes: [...(price ? [] : ["No price was published on the page."]), "Availability was not published; it will be set to Available unless you change it.", "No category was published."] });
    }
  }
  if (overflow) notes.push(`Only the first ${MAX_CANDIDATES} items are shown; a page holds at most 100 items.`);
  if (!out.length) notes.push(blocks ? "This page publishes structured data, but none of it describes " + (kind === "menu" ? "menu items or products" : "products") + "." : "This page doesn’t publish product or menu data that we can read. Many sites don’t. Use the spreadsheet import instead, or try a product or category page of the same site.");
  if (out.some((c) => c.currency && !isCurrency(c.currency))) notes.push("Some prices use a currency Qrenuvi doesn’t support; those rows are flagged.");
  return { candidates: out, notes, structuredBlocks: blocks };
}

export function candidatesTable(c: Candidate[], kind: ImportKind): Table {
  const head = ["Item code", "Category", "Name", "Description", "Price", "Currency", "Availability", ...(kind === "product" ? ["Link"] : []), "Image URL", "Notes"];
  return [head, ...c.map((x) => [x.ref, x.category, x.name, x.description, x.price, x.currency, x.status, ...(kind === "product" ? [x.link] : []), x.imageUrl, x.notes.join(" ")])];
}
