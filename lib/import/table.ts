import { checkDestination } from "@/lib/links";
import { MAX_CATEGORIES, MAX_ITEMS, MAX_ITEMS_PER_CATEGORY, ITEM_REF, type CatItem, type Category } from "@/lib/pages/blocks";
import { newRowId } from "@/lib/pages/card";
import { CURRENCIES, DIETARY, DIETARY_LABEL, MENU_STATUSES, STATUSES, STATUS_LABEL, formatPrice, isCurrency, type Currency, type Dietary, type ItemStatus } from "@/lib/pages/items";

/** Spreadsheet rows to menu or catalogue items. Pure (no I/O) so the browser preview and the server use exactly the same code. */
export type ImportKind = "menu" | "product";
export type Field = "id" | "ref" | "category" | "name" | "description" | "price" | "currency" | "status" | "tags" | "link" | "imageUrl";
export type Mapping = Partial<Record<Field, number>>;
export type Table = string[][];

export const fieldsFor = (kind: ImportKind): Field[] => (kind === "menu"
  ? ["ref", "category", "name", "description", "price", "currency", "status", "tags", "imageUrl", "id"]
  : ["ref", "category", "name", "description", "price", "currency", "status", "link", "imageUrl", "id"]);
export const FIELD_LABEL = (kind: ImportKind): Record<Field, string> => ({
  id: "Item ID (from an export)", ref: kind === "menu" ? "Item code" : "SKU or item code", category: "Category", name: kind === "menu" ? "Dish name" : "Product name", description: "Description",
  price: "Price", currency: "Currency", status: "Availability", tags: "Dietary information", link: "Link to more details", imageUrl: "Image address",
});
const SYN: Record<Field, string[]> = {
  id: ["item id", "itemid", "qrenuvi id"],
  ref: ["sku", "item code", "code", "product code", "item no", "item number", "reference", "ref", "id", "product id", "menu code"],
  category: ["category", "section", "group", "type", "menu section", "collection"],
  name: ["name", "item", "item name", "dish", "dish name", "product", "product name", "title"],
  description: ["description", "details", "desc", "about", "ingredients"],
  price: ["price", "cost", "amount", "unit price", "selling price"],
  currency: ["currency", "curr", "ccy"],
  status: ["availability", "available", "status", "stock", "in stock"],
  tags: ["dietary", "dietary information", "diet", "tags", "allergens", "dietary tags"],
  link: ["link", "url", "product link", "product url", "more details", "enquiry link", "page", "website"],
  imageUrl: ["image", "image url", "image address", "photo", "photo url", "picture", "image link"],
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** First of the first 10 rows that looks like headers (at least two cells, one a known column name). */
export function detectHeaderRow(rows: Table, kind: ImportKind): number {
  const known = new Set(fieldsFor(kind).flatMap((f) => SYN[f]));
  for (let i = 0; i < Math.min(rows.length, 10); i++) { const cells = rows[i].filter((c) => c.trim()); if (cells.length >= 2 && cells.some((c) => known.has(norm(c)))) return i; }
  return 0;
}
/** Guess which column feeds which field. Each column is used once; the exact "Item ID" name is only for round trips. */
export function autoMap(headers: string[], kind: ImportKind): Mapping {
  const m: Mapping = {}; const used = new Set<number>(); const names = headers.map(norm);
  for (const f of fieldsFor(kind)) {
    const hit = names.findIndex((h, i) => !used.has(i) && SYN[f].includes(h) && !(f === "ref" && h === "id" && names.includes("item id")));
    if (hit >= 0) { m[f] = hit; used.add(hit); }
  }
  return m;
}

// ---------- cell parsers ----------
const MONEY: [RegExp, Currency][] = [[/GH₵|₵|\bGHS\b/gi, "GHS"], [/₦|\bNGN\b|\bnaira\b/gi, "NGN"], [/\$|\bUSD\b/gi, "USD"], [/£|\bGBP\b/gi, "GBP"], [/€|\bEUR\b/gi, "EUR"], [/\bKSh\b|\bKES\b/gi, "KES"], [/\bZAR\b|\bR(?=\s*\d)/g, "ZAR"]];
/** Strict price reading. A currency mark is accepted only if it matches the page currency; ambiguous separators are refused, never guessed. */
export function parseImportPrice(raw: string, pageCurrency: Currency): { ok: true; value: string; note?: string } | { ok: false; error: string } {
  let s = raw.replace(/[  ]/g, " ").trim(); if (!s) return { ok: false, error: "Empty price." };
  const seen = new Set<Currency>();
  for (const [re, cur] of MONEY) { if (re.test(s)) { seen.add(cur); s = s.replace(re, " "); } re.lastIndex = 0; }
  if (seen.size > 1) return { ok: false, error: "The price mentions more than one currency." };
  const [cur] = [...seen]; if (cur && cur !== pageCurrency) return { ok: false, error: `The price is in ${cur} but this page shows prices in ${pageCurrency}. Prices are never converted.` };
  s = s.replace(/\s+/g, " ").trim();
  if (/^-/.test(s)) return { ok: false, error: "A price cannot be negative." };
  if (/[^\d.,\s]/.test(s)) return { ok: false, error: `“${raw.trim()}” is not a plain number.` };
  if (/ /.test(s)) { if (/^\d{1,3}( \d{3})+(\.\d{1,2})?$/.test(s)) s = s.replace(/ /g, ""); else return { ok: false, error: `“${raw.trim()}” is not a plain number.` }; }
  const ambiguous = /^\d+,\d{1,2}$/.test(s) || /^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s) || /^\d+\.\d{3}$/.test(s) || /^\d{1,3}(,\d{3})+,\d{1,2}$/.test(s);
  if (ambiguous) return { ok: false, error: `“${raw.trim()}” could be read two ways (thousands or decimals). Write it like 2500 or 2500.50.` };
  let n: string;
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) n = s.replace(/,/g, ""); else if (/^\d+(\.\d{1,2})?$/.test(s)) n = s; else return { ok: false, error: `“${raw.trim()}” is not a plain number.` };
  if (n.split(".")[0].length > 9) return { ok: false, error: "That price is too large." };
  const v = parseFloat(n); const out = Number.isInteger(v) ? String(v) : v.toFixed(2);
  return { ok: true, value: out };
}
const STATUS_WORDS: Record<string, ItemStatus> = { available: "available", "in stock": "available", yes: "available", y: "available", true: "available", "1": "available", on: "available", limited: "limited", "low stock": "limited", "few left": "limited", "sold out": "sold_out", "out of stock": "sold_out", unavailable: "sold_out", no: "sold_out", n: "sold_out", false: "sold_out", "0": "sold_out", off: "sold_out", preorder: "preorder", "pre order": "preorder", "pre-order": "preorder" };
export function parseStatus(raw: string, kind: ImportKind): { ok: true; value: ItemStatus } | { ok: false; error: string } {
  const k = raw.toLowerCase().replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  const v = STATUS_WORDS[k] ?? STATUS_WORDS[k.replace(/-/g, " ")];
  if (!v) return { ok: false, error: `“${raw.trim()}” is not an availability we know. Use ${(kind === "menu" ? MENU_STATUSES : STATUSES).map((s) => STATUS_LABEL[s]).join(", ")}.` };
  if (kind === "menu" && v === "preorder") return { ok: false, error: "Menus have no pre-order status." };
  return { ok: true, value: v };
}
const LABEL_TO_DIET = new Map<string, Dietary>([...DIETARY.map((d) => [d.replace(/_/g, " "), d] as [string, Dietary]), ...DIETARY.map((d) => [DIETARY_LABEL[d].toLowerCase().replace(/-/g, " "), d] as [string, Dietary])]);
export function parseTags(raw: string): { tags: Dietary[]; unknown: string[] } {
  const tags: Dietary[] = [], unknown: string[] = [];
  for (const t of raw.split(/[,;|/]+/).map((x) => x.trim()).filter(Boolean)) { const d = LABEL_TO_DIET.get(t.toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ")); if (d) { if (!tags.includes(d)) tags.push(d); } else unknown.push(t); }
  return { tags, unknown };
}
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

// ---------- interpret ----------
export type Parsed = Partial<{ id: string; ref: string; category: string; name: string; description: string; price: string; status: ItemStatus; tags: Dietary[]; link: string; imageUrl: string }>;
export type RowResult = { line: number; cells: string[]; parsed: Parsed; present: Field[]; errors: string[]; warnings: string[]; example: boolean };

export function interpretRows(rows: Table, headerRow: number, map: Mapping, kind: ImportKind, pageCurrency: Currency): RowResult[] {
  const out: RowResult[] = []; const refs = new Map<string, number>();
  for (let i = headerRow + 1; i < rows.length; i++) {
    const cells = rows[i] ?? []; if (!cells.some((c) => (c ?? "").trim())) continue;
    const get = (f: Field) => (map[f] === undefined ? undefined : (cells[map[f]!] ?? "").replace(/\r\n?/g, "\n").trim());
    const r: RowResult = { line: i + 1, cells, parsed: {}, present: [], errors: [], warnings: [], example: false };
    const set = <K extends keyof Parsed>(f: K, v: Parsed[K]) => { r.parsed[f] = v; r.present.push(f as Field); };
    for (const f of ["id", "ref", "category", "name", "description"] as const) {
      const v = get(f); if (!v) continue;
      if (CONTROL.test(v)) { r.errors.push(`${FIELD_LABEL(kind)[f]} contains unsupported characters.`); continue; }
      const max = { id: 40, ref: 40, category: 60, name: 80, description: 400 }[f];
      if (v.length > max) { r.errors.push(`${FIELD_LABEL(kind)[f]} is longer than ${max} characters (${v.length}).`); continue; }
      if (f === "ref" && !ITEM_REF.test(v)) { r.errors.push("The item code can use letters, numbers, dots, dashes and underscores only (up to 40)."); continue; }
      set(f, v);
    }
    const pr = get("price");
    if (pr) { const p = parseImportPrice(pr, pageCurrency); if (p.ok) set("price", p.value); else r.errors.push(p.error); }
    const cu = get("currency");
    if (cu) { const c = cu.toUpperCase().replace(/[^A-Z]/g, ""); if (!isCurrency(c)) r.errors.push(`Currency “${cu}” is not supported. Use ${CURRENCIES.join(", ")}.`); else if (c !== pageCurrency) r.errors.push(`This row is in ${c} but the page shows ${pageCurrency}. One page uses one currency, and prices are never converted.`); }
    const st = get("status");
    if (st) { const s = parseStatus(st, kind); if (s.ok) set("status", s.value); else r.errors.push(s.error); }
    const tg = get("tags");
    if (tg) { if (kind !== "menu") r.warnings.push("Dietary information applies to menus only and was ignored."); else { const t = parseTags(tg); set("tags", t.tags); if (t.unknown.length) r.warnings.push(`Not recognised and left out: ${t.unknown.join(", ")}. Nothing is guessed about allergens.`); } }
    const lk = get("link");
    if (lk) { if (kind !== "product") r.warnings.push("Links apply to catalogues only and were ignored."); else { const c = checkDestination(lk); if (c.ok) set("link", c.url); else r.errors.push(`Link: ${c.error}`); } }
    const im = get("imageUrl");
    if (im) { const c = checkDestination(im); if (c.ok && c.url.startsWith("https://")) set("imageUrl", c.url); else r.warnings.push("The image address is not a usable https address and was ignored."); }
    if (r.parsed.ref) { const k = r.parsed.ref.toLowerCase(); if (refs.has(k)) r.errors.push(`The code “${r.parsed.ref}” already appears on row ${refs.get(k)} of this file. Codes must be different.`); else refs.set(k, r.line); }
    r.example = /^example\b/i.test(r.parsed.name ?? "") && /^example-/i.test(r.parsed.ref ?? "");
    out.push(r);
  }
  return out;
}

// ---------- plan ----------
export type Options = { mode: "add" | "update" | "both"; fields: Field[]; duplicates: "skip" | "add" };
export const UPDATABLE: Field[] = ["name", "description", "price", "status", "tags", "category", "link", "ref"];
export type Action = "new" | "update" | "unchanged" | "skipped" | "invalid";
export type PlanRow = RowResult & { action: Action; reason: string; changes: string[]; itemId: string | null };
export type Plan = { rows: PlanRow[]; counts: { rows: number; valid: number; invalid: number; skipped: number; added: number; updated: number; unchanged: number; warnings: number }; next: Category[]; imagesPending: number };
export type Existing = { currency: Currency; categories: Category[] };

const key = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
/** Decide, row by row, what would happen. Names alone never identify an item; only the item ID or code do. Nothing is ever deleted. */
export function planImport(existing: Existing, results: RowResult[], kind: ImportKind, opt: Options, rowLimit: number): Plan {
  const blank = (i: CatItem) => !i.name.trim() && !i.description.trim() && !i.price && !i.ref && !i.link && !i.imageId; // the empty starter row a new page begins with
  const cats: Category[] = existing.categories.map((c) => ({ ...c, items: c.items.filter((i) => !blank(i)).map((i) => ({ ...i, tags: [...i.tags] })) }));
  const byId = new Map<string, CatItem>(), byRef = new Map<string, CatItem>(), where = new Map<string, Category>();
  const index = () => { byId.clear(); byRef.clear(); where.clear(); for (const c of cats) for (const i of c.items) { byId.set(i.id, i); if (i.ref) byRef.set(i.ref.toLowerCase(), i); where.set(i.id, c); } };
  index();
  const total = () => cats.reduce((n, c) => n + c.items.length, 0);
  const seenNew = new Set<string>(); const rows: PlanRow[] = [];
  const catFor = (name: string): Category | null => {
    const k = key(name || (kind === "menu" ? "Menu" : "Products"));
    let c = cats.find((x) => key(x.name) === k); if (c) return c;
    if (cats.length === 1 && !cats[0].name && cats[0].items.length === 0) { cats[0].name = name || (kind === "menu" ? "Menu" : "Products"); return cats[0]; }
    if (cats.length >= MAX_CATEGORIES) return null;
    c = { id: newRowId(), name: name || (kind === "menu" ? "Menu" : "Products"), items: [] }; cats.push(c); return c;
  };
  let processed = 0;
  for (const r of results) {
    const p: PlanRow = { ...r, action: "invalid", reason: "", changes: [], itemId: null };
    rows.push(p);
    if (r.errors.length) { p.reason = r.errors[0]; continue; }
    if (++processed > rowLimit) { p.reason = `Over the limit of ${rowLimit} rows per import on your plan.`; p.errors = [p.reason]; continue; }
    if (r.example) { p.action = "skipped"; p.reason = "Template example row."; continue; }
    let match: CatItem | undefined;
    if (r.parsed.id) { match = byId.get(r.parsed.id); if (!match) { p.errors = [`No item with the ID “${r.parsed.id}” exists on this page.`]; p.reason = p.errors[0]; continue; } }
    else if (r.parsed.ref) match = byRef.get(r.parsed.ref.toLowerCase());
    if (match) {
      p.itemId = match.id;
      if (opt.mode === "add") { p.action = "skipped"; p.reason = "Already on the page. This import only adds new items."; continue; }
      const allow = new Set(opt.fields); const changes: string[] = [];
      const cur = match; const set = (f: Field, label: string, apply: () => void, differs: boolean) => { if (allow.has(f) && r.present.includes(f) && differs) { apply(); changes.push(label); } };
      set("name", "name", () => { cur.name = r.parsed.name!; }, cur.name !== r.parsed.name);
      set("description", "description", () => { cur.description = r.parsed.description!; }, cur.description !== r.parsed.description);
      set("price", "price", () => { cur.price = r.parsed.price!; }, Number(cur.price.replace(/,/g, "")) !== Number(r.parsed.price));
      set("status", "availability", () => { cur.status = r.parsed.status!; }, cur.status !== r.parsed.status);
      set("tags", "dietary information", () => { cur.tags = r.parsed.tags!; }, kind === "menu" && JSON.stringify([...cur.tags].sort()) !== JSON.stringify([...(r.parsed.tags ?? [])].sort()));
      set("link", "link", () => { cur.link = r.parsed.link!; }, cur.link !== r.parsed.link);
      set("ref", "item code", () => { cur.ref = r.parsed.ref!; }, cur.ref !== r.parsed.ref);
      if (allow.has("category") && r.present.includes("category") && key(where.get(cur.id)?.name ?? "") !== key(r.parsed.category!)) {
        const from = where.get(cur.id)!; const to = catFor(r.parsed.category!);
        if (!to) { p.errors = [`Over the limit of ${MAX_CATEGORIES} categories.`]; p.reason = p.errors[0]; continue; }
        if (to.items.length >= MAX_ITEMS_PER_CATEGORY) { p.errors = [`The category “${to.name}” is full (${MAX_ITEMS_PER_CATEGORY} items).`]; p.reason = p.errors[0]; continue; }
        from.items = from.items.filter((x) => x.id !== cur.id); to.items.push(cur); where.set(cur.id, to); changes.push("category");
      }
      p.changes = changes; p.action = changes.length ? "update" : "unchanged"; p.reason = changes.length ? `Will change: ${changes.join(", ")}.` : "Already up to date.";
      continue;
    }
    if (opt.mode === "update") { p.action = "skipped"; p.reason = r.parsed.id || r.parsed.ref ? "No matching item on the page to update." : "This import only updates items. Rows need an item ID or code to be matched."; continue; }
    if (!r.parsed.name) { p.errors = [`Every new ${kind === "menu" ? "dish" : "product"} needs a name.`]; p.reason = p.errors[0]; continue; }
    const dupKey = key(r.parsed.category ?? "") + "|" + key(r.parsed.name);
    const isDup = !r.parsed.ref && (cats.some((c) => key(c.name || (kind === "menu" ? "Menu" : "Products")) === key(r.parsed.category || (kind === "menu" ? "Menu" : "Products")) && c.items.some((i) => key(i.name) === key(r.parsed.name!))) || seenNew.has(dupKey));
    if (isDup && opt.duplicates === "skip") { p.action = "skipped"; p.reason = "Possible duplicate: same name in the same category and no code to tell them apart. Add a code, or choose to add duplicates."; continue; }
    if (total() >= MAX_ITEMS) { p.errors = [`The page already holds the most items it can (${MAX_ITEMS}).`]; p.reason = p.errors[0]; continue; }
    const c = catFor(r.parsed.category ?? ""); if (!c) { p.errors = [`Over the limit of ${MAX_CATEGORIES} categories.`]; p.reason = p.errors[0]; continue; }
    if (c.items.length >= MAX_ITEMS_PER_CATEGORY) { p.errors = [`The category “${c.name}” is full (${MAX_ITEMS_PER_CATEGORY} items).`]; p.reason = p.errors[0]; continue; }
    const it: CatItem = { id: newRowId(), name: r.parsed.name, description: r.parsed.description ?? "", price: r.parsed.price ?? "", imageId: null, meta: null, status: r.parsed.status ?? "available", tags: kind === "menu" ? r.parsed.tags ?? [] : [], ref: r.parsed.ref ?? "", link: kind === "product" ? r.parsed.link ?? "" : "" };
    c.items.push(it); index(); seenNew.add(dupKey);
    p.action = "new"; p.itemId = it.id; p.reason = r.parsed.category ? "Will be added." : `Will be added to “${c.name}” (no category given).`;
  }
  const n = (a: Action) => rows.filter((x) => x.action === a).length;
  const imagesPending = rows.filter((x) => (x.action === "new" || x.action === "update") && x.parsed.imageUrl).length;
  return { rows, counts: { rows: rows.length, valid: n("new") + n("update") + n("unchanged"), invalid: n("invalid"), skipped: n("skipped"), added: n("new"), updated: n("update"), unchanged: n("unchanged"), warnings: rows.filter((x) => x.warnings.length).length }, next: cats.filter((c, i) => c.items.length || cats.length === 1 || i === 0), imagesPending };
}

// ---------- templates, exports, error report ----------
export function templateRows(kind: ImportKind, currency: Currency): Table {
  const head = kind === "menu" ? ["Item code", "Category", "Name", "Description", "Price", "Currency", "Availability", "Dietary", "Image URL"] : ["SKU", "Category", "Name", "Description", "Price", "Currency", "Availability", "Link", "Image URL"];
  return kind === "menu"
    ? [head, ["EXAMPLE-1", "Mains", "Example: Jollof rice (delete this row)", "Smoky party jollof with fried plantain", "3500", currency, "Available", "Halal; Spicy", ""], ["EXAMPLE-2", "Drinks", "Example: Zobo (delete this row)", "Chilled hibiscus drink", "800", currency, "Limited", "Vegan", ""]]
    : [head, ["EXAMPLE-1", "Bags", "Example: Leather tote (delete this row)", "Hand-stitched, two colours", "28000", currency, "Available", "https://example.com/tote", ""], ["EXAMPLE-2", "Bags", "Example: Mini purse (delete this row)", "Fits a phone and cards", "9500", currency, "Pre-order", "", ""]];
}
export function exportRows(kind: ImportKind, currency: Currency, cats: Category[]): Table {
  const head = ["Item ID", kind === "menu" ? "Item code" : "SKU", "Category", "Name", "Description", "Price", "Currency", "Availability", kind === "menu" ? "Dietary" : "Link"];
  const out: Table = [head];
  for (const c of cats) for (const i of c.items.filter((x) => x.name.trim() || x.ref || x.description.trim() || x.price)) out.push([i.id, i.ref, c.name, i.name, i.description, i.price, currency, STATUS_LABEL[i.status], kind === "menu" ? i.tags.map((t) => DIETARY_LABEL[t]).join("; ") : i.link]);
  return out;
}
export function errorReport(plan: Plan, headers: string[]): Table {
  const bad = plan.rows.filter((r) => r.action === "invalid" || r.warnings.length);
  return [["Row", "Result", "Problem or note", ...headers], ...bad.map((r) => [String(r.line), r.action === "invalid" ? "Not imported" : "Imported with a note", [...r.errors, ...r.warnings].join(" "), ...headers.map((_, i) => r.cells[i] ?? "")])];
}
export const money = (v: string, cur: Currency) => (v ? formatPrice(Number(v), cur) : "");
