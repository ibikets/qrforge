// Structured-data extraction from a web page: what is read, what is flagged, and what is never invented. Local logic only.
import { candidatesTable, extractCandidates, plain } from "../lib/import/web";
import { interpretRows, autoMap, planImport } from "../lib/import/table";
let bad = 0; const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const page = (...j: unknown[]) => `<html><head>${j.map((x) => `<script type="application/ld+json">${typeof x === "string" ? x : JSON.stringify(x).replace(/</g, "\\u003c")}</script>`).join("")}</head><body>x</body></html>`;
const U = "https://shop.example.com/collections/bags";

const shop = page({ "@context": "https://schema.org", "@graph": [
  { "@type": "Product", name: "Leather tote", description: "<p>Hand-stitched &amp; lined</p>", sku: "TOTE-1", image: ["/img/tote.jpg", "https://cdn.example.com/b.jpg"], category: "Home > Bags", url: "/products/tote", offers: { "@type": "Offer", price: "28000", priceCurrency: "NGN", availability: "https://schema.org/InStock" } },
  { "@type": "Product", name: "Mini purse", offers: { "@type": "Offer", price: 9500, priceCurrency: "NGN", availability: "http://schema.org/PreOrder" } },
  { "@type": "Product", name: "Range bag", offers: { "@type": "AggregateOffer", lowPrice: "1000", highPrice: "5000", priceCurrency: "NGN" } },
  { "@type": "Product", name: "No offer bag" },
  { "@type": "Product", name: "Dollar bag", offers: { price: "20", priceCurrency: "USD", availability: "OutOfStock" } },
  { "@type": "Product", name: "Hostile <script>alert(1)</script> bag", image: "javascript:alert(1)", url: "http://insecure.example.com/x", sku: "bad sku!", offers: { price: "5" } },
  { "@type": "Product", name: "Leather tote", sku: "TOTE-1", offers: { price: "1" } },
] });
let e = extractCandidates(shop, U, "product"); let c = e.candidates;
ok(c.length === 6, "6 distinct products (duplicate sku+name collapsed): " + c.length);
const tote = c[0];
ok(tote.name === "Leather tote" && tote.description === "Hand-stitched & lined" && tote.ref === "TOTE-1" && tote.price === "28000" && tote.currency === "NGN" && tote.status === "Available" && tote.category === "Bags", "price, currency, sku, availability, category and cleaned description read as published");
ok(tote.imageUrl === "https://shop.example.com/img/tote.jpg" && tote.link === "https://shop.example.com/products/tote", "relative image and product links resolved against the page");
ok(c[1].status === "Pre-order" && c[1].price === "9500", "numeric price and PreOrder read");
ok(c[2].price === "" && c[2].notes.some((n) => /price range/.test(n)), "a price range is NOT turned into a price");
ok(c[3].price === "" && c[3].notes.some((n) => /No price/.test(n)) && c[3].notes.some((n) => /Availability was not published/.test(n)) && c[3].notes.some((n) => /No category/.test(n)), "missing price, availability and category are flagged, never invented");
ok(c[3].status === "" && c[3].link === U, "…availability stays blank; link falls back to the page you imported from");
ok(!/[<>]/.test(c[5].name) && c[5].imageUrl === "" && c[5].link === U && c[5].ref === "" && c[5].notes.some((n) => /isn’t usable as an item code/.test(n)), "tags stripped; javascript:/http image and link dropped; bad sku not used");

// flows into the normal review pipeline: wrong currency refused, nothing converted
const t = candidatesTable(c, "product"); const m = autoMap(t[0], "product");
const res = interpretRows(t, 0, m, "product", "NGN");
const usd = res.find((r) => r.parsed.name === "Dollar bag")!;
ok(usd.errors.some((x) => /never converted/.test(x)) || usd.errors.some((x) => /USD/.test(x)), "a USD price on an NGN page is refused by the same validator");
ok(res[0].errors.length === 0 && res[0].warnings.length === 0, "a complete product has no errors or notes");
ok(res[3].warnings.length >= 3, "notes surface as review warnings (" + res[3].warnings.length + ")");
const plan = planImport({ currency: "NGN", categories: [] }, res, "product", { mode: "both", fields: [], duplicates: "skip" }, 500);
ok(plan.counts.added === 5 && plan.counts.invalid === 1, "plan: 5 usable rows, 1 refused");

// menus
const menu = page({ "@type": "Restaurant", hasMenu: { "@type": "Menu", hasMenuSection: [{ "@type": "MenuSection", name: "Starters", hasMenuItem: [{ "@type": "MenuItem", name: "Suya", description: "Beef", offers: { "@type": "Offer", price: "2500", priceCurrency: "NGN" } }] }, { "@type": "MenuSection", name: "Mains", hasMenuItem: [{ "@type": "MenuItem", name: "Jollof", offers: { price: "3500", availability: "PreOrder" } }, { "@type": "MenuItem", name: "Free sample" }] }] } });
const me = extractCandidates(menu, "https://food.example.com/menu", "menu");
ok(me.candidates.length === 3 && me.candidates[0].category === "Starters" && me.candidates[1].category === "Mains" && me.candidates[0].price === "2500", "menu sections become categories");
ok(me.candidates[1].status === "" && me.candidates[1].notes.some((n) => /Pre-order does not apply/.test(n)), "pre-order dropped for menus with a note");
ok(candidatesTable(me.candidates, "menu")[0].includes("Link") === false, "menu sheet has no link column");
ok(!me.candidates.some((x) => x.notes.some((n) => /allerg|dietary/i.test(n))) && candidatesTable(me.candidates, "menu")[0].every((h) => !/diet/i.test(h)), "dietary information is never extracted or guessed");

// lists, Open Graph, empties, hostile inputs
const list = page({ "@type": "ItemList", itemListElement: [{ "@type": "ListItem", position: 1, item: { "@type": "Product", name: "Listed", offers: { price: "10" } } }] });
ok(extractCandidates(list, U, "product").candidates.length === 1, "ItemList / ListItem products found");
const og = `<html><head><meta property="og:type" content="product"><meta property="og:title" content="OG chair"><meta property="product:price:amount" content="450"><meta property="product:price:currency" content="NGN"></head></html>`;
const oe = extractCandidates(og, U, "product"); ok(oe.candidates.length === 1 && oe.candidates[0].price === "450", "Open Graph product tags used when there is no JSON-LD");
const none = extractCandidates("<html><body><h1>Our menu</h1><p>Rice 2000</p></body></html>", U, "menu");
ok(none.candidates.length === 0 && /doesn’t publish/.test(none.notes.join(" ")), "page with only visible text: nothing guessed from layout, honest message");
ok(extractCandidates(page("{not json"), U, "product").notes.some((n) => /not valid/.test(n)), "invalid JSON-LD skipped with a note");
ok(extractCandidates(page({ "@type": "Product", name: "P", "__proto__": { polluted: 1 }, offers: { price: "1" } }), U, "product").candidates.length === 1 && ({} as Record<string, unknown>).polluted === undefined, "prototype keys harmless");
let deep: unknown = { "@type": "Product", name: "Deep", offers: { price: "1" } }; for (let i = 0; i < 40; i++) deep = { "@graph": [deep] };
ok(extractCandidates(page(deep), U, "product").candidates.length === 0, "excessive nesting is not followed");
const manyP = page({ "@graph": Array.from({ length: 300 }, (_, i) => ({ "@type": "Product", name: "P" + i, offers: { price: "1" } })) });
const mm = extractCandidates(manyP, U, "product"); ok(mm.candidates.length === 100 && mm.notes.some((n) => /first 100/.test(n)), "capped at the page limit with a note");
ok(extractCandidates("<script type=application/ld+json>{\"a\":\"" + "x".repeat(600_000) + "\"}</script>", U, "product").notes.some((n) => /too large/.test(n)), "oversized block skipped");
ok(plain("a‮b\u0007c&#x1F600;&#0;&lt;i&gt;") === "abc😀<i>", "text cleaning: bidi/control characters removed, entities decoded, never re-parsed as HTML");
console.log(bad ? `${bad} FAILED` : "ALL PASS"); process.exit(bad ? 1 : 0);
