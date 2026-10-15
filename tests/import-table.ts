// Mapping, row interpretation, planning (add/update, stable matching, caps) and templates. Local logic only.
import { autoMap, detectHeaderRow, errorReport, exportRows, interpretRows, parseImportPrice, parseStatus, parseTags, planImport, templateRows, type Options } from "../lib/import/table";
import { safeCell } from "../lib/import/export";
import type { Category } from "../lib/pages/blocks";
let bad = 0; const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const P = (s: string) => parseImportPrice(s, "NGN");
ok(JSON.stringify(P("₦3,500")) === '{"ok":true,"value":"3500"}', "price: naira sign and thousands comma");
ok(JSON.stringify(P("2500.5")) === '{"ok":true,"value":"2500.50"}', "price: decimals normalised");
ok(P("1 200").ok && (P("1 200") as { value: string }).value === "1200", "price: space thousands");
ok(!P("1,5").ok && !P("1.500").ok && !P("2.500,00").ok, "price: ambiguous separators refused");
ok(!P("$20").ok && /never converted/.test((P("$20") as { error: string }).error), "price: wrong currency refused, not converted");
ok(!P("-5").ok && !P("free").ok && !P("").ok && !P("1e3").ok && !P("12345678901").ok, "price: negative, words, empty, exponent, huge refused");
ok(parseStatus("Out of stock", "product").ok && !parseStatus("pre-order", "menu").ok && !parseStatus("maybe", "menu").ok, "status words");
ok(JSON.stringify(parseTags("Halal; vegan, Mystery")) === '{"tags":["halal","vegan"],"unknown":["Mystery"]}', "tags: known kept, unknown reported not guessed");

const t = templateRows("menu", "NGN");
ok(detectHeaderRow([["Our menu"], [], ...t], "menu") === 2, "header row found after title lines");
const m = autoMap(t[0], "menu");
ok(m.ref === 0 && m.category === 1 && m.name === 2 && m.price === 4 && m.currency === 5 && m.status === 6 && m.tags === 7, "auto-map template headers");

const cats = (): Category[] => [{ id: "c1", name: "Mains", items: [
  { id: "i1", name: "Jollof", description: "old", price: "3000", imageId: "img1", meta: { w: 1, h: 1 }, status: "available", tags: ["halal"], ref: "J1", link: "" },
  { id: "i2", name: "Stew", description: "", price: "", imageId: null, meta: null, status: "available", tags: [], ref: "", link: "" }] }];
const opt = (o: Partial<Options> = {}): Options => ({ mode: "both", fields: ["name", "description", "price", "status", "category", "tags"], duplicates: "skip", ...o });
const run = (rows: string[][], o = opt(), kind: "menu" | "product" = "menu") => { const head = ["Code", "Category", "Name", "Description", "Price", "Availability"]; const tb = [head, ...rows]; const mp = autoMap(head, kind); return planImport({ currency: "NGN", categories: cats() }, interpretRows(tb, 0, mp, kind, "NGN"), kind, o, 100); };

let p = run([["J1", "Mains", "Jollof rice", "new", "3500", "Limited"], ["", "Drinks", "Zobo", "", "800", ""], ["", "Mains", "Stew", "", "", ""]]);
ok(p.counts.updated === 1 && p.counts.added === 1 && p.counts.skipped === 1, "plan: code matches update, new added, nameless-code duplicate skipped");
const j = p.next[0].items[0];
ok(j.id === "i1" && j.imageId === "img1" && j.name === "Jollof rice" && j.price === "3500" && j.status === "limited" && j.tags[0] === "halal", "update keeps id, image and unmapped dietary tags");
ok(p.next.length === 2 && p.next[1].name === "Drinks", "plan: new category created");
p = run([["J1", "", "Jollof", "", "", ""]]); ok(p.counts.unchanged === 1 && p.counts.updated === 0, "plan: blank cells keep existing; no-op reported as unchanged");
p = run([["J1", "", "Changed", "", "", ""]], opt({ fields: ["price"] })); ok(p.counts.unchanged === 1, "plan: only selected fields may be replaced");
p = run([["J1", "", "X", "", "", ""]], opt({ mode: "add" })); ok(p.counts.skipped === 1 && p.counts.added === 0, "plan: add-only never touches matched");
p = run([["Z9", "", "Nope", "", "", ""]], opt({ mode: "update" })); ok(p.counts.skipped === 1 && p.counts.added === 0, "plan: update-only never adds");
p = run([["", "", "Stew", "", "", ""]], opt({ duplicates: "add" })); ok(p.counts.added === 1, "plan: duplicates can be allowed on purpose");
p = run([["A1", "", "A", "", "", ""], ["a1", "", "B", "", "", ""]]); ok(p.counts.added === 1 && p.counts.invalid === 1, "plan: repeated code within a file rejected");
ok(p.next.flatMap((c) => c.items).length === 3, "plan: nothing deleted when rows are missing");
p = run([["", "", "A", "", "5", ""], ["", "", "B", "", "6", ""]], opt()); const q = planImport({ currency: "NGN", categories: cats() }, interpretRows([["Name", "Price"], ["A", "5"], ["B", "6"]], 0, { name: 0, price: 1 }, "menu", "NGN"), "menu", opt(), 1);
ok(q.counts.added === 1 && q.counts.invalid === 1, "plan: per-import row limit");
p = run([["", "", "", "", "", ""], ["", "", "NoPrice", "", "abc", ""]]); ok(p.counts.rows === 1 && p.counts.invalid === 1, "plan: blank lines ignored, bad price rejected with reason");
p = run([["EXAMPLE-1", "Mains", "Example: x (delete this row)", "", "5", ""]]); ok(p.counts.skipped === 1, "plan: template example rows skipped");
p = run([["", "", "A".repeat(81), "", "", ""], ["", "", "ok\u0007", "", "", ""]]); ok(p.counts.invalid === 2, "plan: over-long and control characters rejected");
ok(errorReport(p, ["Code"]).length === 3, "error report lists bad rows");
{ const starter: Category[] = [{ id: "s", name: "", items: [{ id: "b", name: "", description: "", price: "", imageId: null, meta: null, status: "available", tags: [], ref: "", link: "" }] }];
  const q2 = planImport({ currency: "NGN", categories: starter }, interpretRows([["Name", "Category"], ["Rice", "Mains"]], 0, { name: 0, category: 1 }, "menu", "NGN"), "menu", opt(), 10);
  ok(q2.next.length === 1 && q2.next[0].name === "Mains" && q2.next[0].items.length === 1 && q2.next[0].items[0].name === "Rice", "plan: the empty starter row is replaced, not left behind"); }
const ex = exportRows("menu", "NGN", cats()); ok(ex[1][0] === "i1" && ex.length === 3, "export carries stable item ids");
ok(safeCell("=SUM(A1)").startsWith("'") && safeCell("+1").startsWith("'") && safeCell("@x").startsWith("'"), "export: formulas neutralised");
console.log(bad ? `${bad} FAILED` : "ALL PASS"); process.exit(bad ? 1 : 0);
