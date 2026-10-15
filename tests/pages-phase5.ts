// Phase 5 sections: menus, product catalogues, events, campaigns, display-only offers. Run: npx tsx tests/pages-phase5.ts
import {
  KIND_INFO, emptyBlock, emptyContent, normaliseContent, readPageSnapshot, snapshotMediaIds, snapshotOfContent, validateContent, contentMedia, withoutMissingMedia, withStoredFacts,
  type Block, type PageContent,
} from "../lib/pages/blocks";
import { engineFor, isPageKind, kindLabel } from "../lib/pages/kinds";
import { enquiryLinks, eventState, formatPrice, offerState, parsePrice, validDateOnly, validLocalDateTime, zonedToEpoch } from "../lib/pages/items";

let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const U1 = "11111111-1111-4111-8111-111111111111";
const named = <C extends PageContent>(c: C): C => { (c.blocks[0] as { name: string }).name = "Test name"; return c; };
const get = <T extends Block["type"]>(c: PageContent, t: T) => c.blocks.find((b) => b.type === t) as Extract<Block, { type: T }>;
const KINDS = ["menu", "product", "event", "campaign", "coupon"] as const;

for (const k of KINDS) {
  ok(isPageKind(k) && engineFor(k) !== null && kindLabel(k) === KIND_INFO[k].label, `${k}: registered kind with an engine`);
  const c = emptyContent(k);
  ok(Object.keys(validateContent(c, false)).length === 0, `${k}: empty draft saves`);
  ok(Object.keys(validateContent(c, true)).length > 0, `${k}: empty page cannot be published`);
  ok(c.blocks.slice(1).every((b) => KIND_INFO[k].allow.includes(b.type as never)), `${k}: starts with allowed sections only`);
}

// ---- prices and formatting
ok(parsePrice("2,500") === 2500 && parsePrice("2500.5") === 2500.5 && parsePrice(" 10 ") === 10, "prices accept digits, commas, up to two decimals");
ok(["", "abc", "-5", "1.234", "₦5", "1e3", "12345678901", "5.", ".5"].every((v) => parsePrice(v) === null), "bad prices are rejected");
ok(formatPrice(2500, "NGN").includes("2,500") && !formatPrice(2500, "NGN").includes(".00"), "whole prices show no decimals");
ok(formatPrice(9.5, "USD").includes("9.50"), "fractional prices show two decimals");
ok(formatPrice(5, "XXX").includes("5"), "unknown currency falls back, never throws");

// ---- menu
{
  const c = emptyContent("menu");
  const it = get(c, "items");
  it.categories[0].name = "Mains";
  Object.assign(it.categories[0].items[0], { name: "Jollof rice", price: "3,500", description: "Smoky party jollof", tags: ["halal", "spicy"], status: "limited" });
  it.categories[0].items.push({ id: "i2", name: "", description: "", price: "", imageId: null, meta: null, status: "available", tags: [] });
  const snap = snapshotOfContent(c);
  const pub = snap.blocks.find((b) => b.type === "items");
  ok(pub?.type === "items" && pub.categories[0].items.length === 1 && pub.categories[0].items[0].price === 3500, "snapshot keeps finished items and numeric price");
  ok(pub?.type === "items" && pub.enquiry === null, "menus carry no enquiry (nothing can be ordered)");
  ok(pub?.type === "items" && pub.categories[0].items[0].tags.join() === "halal,spicy" && pub.categories[0].items[0].status === "limited", "dietary tags and availability reach the snapshot");
  const withPre = normaliseContent("menu", { blocks: [{ type: "items", categories: [{ name: "A", items: [{ name: "x", status: "preorder", tags: ["vegan", "bogus"] }] }] }] });
  const i0 = get(withPre, "items").categories[0].items[0];
  ok(i0.status === "available" && i0.tags.join() === "vegan", "menu normalisation: no pre-order, unknown tags dropped");
  named(c); ok(Object.keys(validateContent(c, true)).length === 0, "a menu with one dish publishes");
}

// ---- product catalogue
{
  const c = emptyContent("product");
  const it = get(c, "items");
  it.categories[0].name = "Dresses";
  Object.assign(it.categories[0].items[0], { name: "Ankara dress", price: "15000", tags: ["vegan" as never], status: "preorder" });
  ok(get(normaliseContent("product", c), "items").categories[0].items[0].tags.length === 0, "catalogue drops dietary tags");
  ok(get(normaliseContent("product", c), "items").categories[0].items[0].status === "preorder", "catalogue keeps pre-order");
  ok(validateContent(c, true).page?.includes("WhatsApp"), "catalogue cannot publish without an enquiry method");
  const a = get(c, "actions");
  a.phones[0].value = "+234 801 234 5678"; a.phones[0].whatsapp = true;
  ok(validateContent(c, true).page === undefined, "catalogue publishes once WhatsApp is set");
  const pub = snapshotOfContent(c).blocks.find((b) => b.type === "items");
  ok(pub?.type === "items" && pub.enquiry?.whatsapp === "2348012345678" && pub.enquiry.email === null, "enquiry number is digits only");
  a.phones[0].public = false; a.emails[0].value = "shop@example.com";
  const pub2 = snapshotOfContent(c).blocks.find((b) => b.type === "items");
  ok(pub2?.type === "items" && pub2.enquiry?.whatsapp === null && pub2.enquiry.email === "shop@example.com", "a private phone is never used for enquiries; email is the fallback");
  a.hidden = true;
  const pub3 = snapshotOfContent(c).blocks.find((b) => b.type === "items");
  ok(pub3?.type === "items" && pub3.enquiry === null, "hiding the contact section removes the enquiry");
  const l = enquiryLinks({ whatsapp: "2348012345678", email: "shop@example.com" }, { name: "Ankara dress", price: 15000 }, "NGN", "Ada Fashion");
  ok(l.whatsapp!.startsWith("https://wa.me/2348012345678?text=") && decodeURIComponent(l.whatsapp!).includes("Ankara dress") && decodeURIComponent(l.whatsapp!).includes("15,000"), "WhatsApp link names the product and price");
  ok(l.email!.startsWith("mailto:shop@example.com?subject=") && l.email!.includes("Ankara%20dress"), "email link names the product");
  ok(enquiryLinks(null, { name: "x", price: null }, "NGN", "").whatsapp === null, "no enquiry, no links");
}

// ---- item and category structure
{
  const big = { blocks: [{ type: "items", categories: Array.from({ length: 30 }, (_, ci) => ({ id: "c" + ci, name: "C" + ci, items: Array.from({ length: 50 }, (_, ii) => ({ id: "i" + ii, name: "n", price: "1" })) })) }] };
  const n = get(normaliseContent("menu", big), "items");
  const total = n.categories.reduce((s, c) => s + c.items.length, 0);
  ok(n.categories.length === 12 && n.categories.every((c) => c.items.length <= 40) && total <= 100, "categories, items per category and total items are capped");
  const dup = get(normaliseContent("menu", { blocks: [{ type: "items", categories: [{ id: "a", items: [{ id: "x", name: "1" }, { id: "x", name: "2" }] }, { id: "a", items: [] }] }] }), "items");
  ok(new Set(dup.categories.map((c) => c.id)).size === 2 && new Set(dup.categories[0].items.map((i) => i.id)).size === 2, "duplicate ids are repaired");
  const c = emptyContent("menu"); const it = get(c, "items");
  it.categories[0].items[0].price = "ten naira";
  ok(!!validateContent(c, false)[`${it.id}.items.${it.categories[0].items[0].id}`], "an invalid price is an error even in a draft");
  it.categories[0].items[0].price = ""; it.categories[0].items[0].description = "no name";
  ok(!!validateContent(c, true)[`${it.id}.items.${it.categories[0].items[0].id}`] && !validateContent(c, false)[`${it.id}.items.${it.categories[0].items[0].id}`], "an unnamed item blocks publishing, not saving");
  it.categories.push({ id: "c2", name: "", items: [{ id: "z", name: "Tea", description: "", price: "", imageId: null, meta: null, status: "available", tags: [] }] });
  it.categories[0].name = "Mains"; it.categories[0].items[0].name = "Rice";
  ok(!!validateContent(c, true)[`${it.id}.cat.c2`], "with several categories each needs a name to publish");
}

// ---- media
{
  const c = emptyContent("product"); const it = get(c, "items");
  Object.assign(it.categories[0].items[0], { name: "Bag", imageId: U1, meta: { w: 800, h: 600 } });
  ok(contentMedia(c).some((m) => m.id === U1 && m.kind === "image"), "item photos are media references of kind image");
  const snap = snapshotOfContent(c);
  ok(snapshotMediaIds(snap).includes(U1), "published snapshot lists item photos (public media route allows them)");
  ok(snapshotMediaIds(readPageSnapshot(JSON.parse(JSON.stringify(snap)))!).includes(U1), "snapshot survives a JSON round trip");
  ok(get(withoutMissingMedia(c, new Set()), "items").categories[0].items[0].imageId === null, "restoring without the file keeps the item, drops the photo");
  const noMeta = emptyContent("product"); Object.assign(get(noMeta, "items").categories[0].items[0], { name: "Hat", imageId: U1, meta: null });
  const p = snapshotOfContent(noMeta).blocks.find((b) => b.type === "items");
  ok(p?.type === "items" && p.categories[0].items[0].imageId === null, "a photo without stored facts is not published");
  const facts = withStoredFacts(c, new Map([[U1, { kind: "image", bytes: 10, mime: "image/webp", width: 640, height: 480, name: null, pages: null }]]));
  ok(get(facts, "items").categories[0].items[0].meta?.w === 640, "photo dimensions come from the stored record");
  ok(engineFor("product")!.uploads.includes("image") && engineFor("menu")!.uploads.includes("image"), "menu and catalogue may upload images");
  ok(!engineFor("menu")!.uploads.includes("file"), "menus cannot upload PDFs");
}

// ---- event
{
  ok(validLocalDateTime("2026-12-05T18:00") && !validLocalDateTime("2026-02-30T10:00") && !validLocalDateTime("2026-12-05 18:00") && !validLocalDateTime("2026-12-05T24:00"), "local date-time validation");
  const c = emptyContent("event"); const ev = get(c, "event");
  ok(validateContent(c, true)[`${ev.id}.startsAt`] !== undefined, "event needs a start to publish");
  ev.startsAt = "2026-12-05T18:00"; ev.endsAt = "2026-12-05T17:00";
  ok(!!validateContent(c, false)[`${ev.id}.endsAt`], "end before start is an error");
  ev.endsAt = "2026-12-05T21:00"; ev.timezone = "Not/AZone";
  ok(!!validateContent(c, false)[`${ev.id}.timezone`], "invalid time zone is an error");
  ev.timezone = "Africa/Lagos";
  ok(Object.keys(validateContent(c, false)).length === 0, "valid event has no errors");
  ok(validateContent(c, true).page === undefined, "event publishes with a date");
  const pub = snapshotOfContent(c).blocks.find((b) => b.type === "event");
  ok(pub?.type === "event" && pub.startsAt === "2026-12-05T18:00" && pub.timezone === "Africa/Lagos", "event snapshot keeps wall-clock time and zone");
  ok(zonedToEpoch("2026-12-05T18:00", "Africa/Lagos") === Date.UTC(2026, 11, 5, 17, 0), "Lagos is UTC+1");
  ok(zonedToEpoch("2026-12-05T18:00", "America/New_York") === Date.UTC(2026, 11, 5, 23, 0), "New York winter is UTC-5");
  ok(zonedToEpoch("2026-07-05T18:00", "America/New_York") === Date.UTC(2026, 6, 5, 22, 0), "New York summer is UTC-4 (daylight saving)");
  const now = Date.UTC(2026, 11, 5, 17, 30);
  ok(eventState("2026-12-05T18:00", "2026-12-05T21:00", "Africa/Lagos", now) === "now", "event in progress");
  ok(eventState("2026-12-05T18:00", "2026-12-05T21:00", "Africa/Lagos", now - 3_600_000) === "upcoming", "event upcoming");
  ok(eventState("2026-12-05T18:00", "2026-12-05T21:00", "Africa/Lagos", now + 5 * 3_600_000) === "ended", "event ended");
  ok(eventState("2026-12-05T18:00", "", "Africa/Lagos", now + 4 * 3_600_000) === "ended", "no end time: over three hours after the start");
  const dev = normaliseContent("event", { blocks: [{ type: "event", startsAt: "bogus", timezone: "Africa/Lagos" }] });
  ok(snapshotOfContent(dev).blocks.every((b) => b.type !== "event"), "an unreadable date is never published");
}

// ---- offers
{
  ok(validDateOnly("2026-12-31") && !validDateOnly("2026-13-01") && !validDateOnly("31-12-2026"), "date-only validation");
  const c = emptyContent("coupon"); const o = get(c, "offer");
  ok(!!validateContent(c, true).page, "offers page needs an offer");
  Object.assign(o, { title: "10% off", code: "SAVE 10", validFrom: "2026-12-01", validUntil: "2026-12-31" });
  ok(!!validateContent(c, false)[`${o.id}.code`], "codes with spaces are rejected");
  o.code = "SAVE10";
  Object.assign(o, { validUntil: "2026-11-30" });
  ok(!!validateContent(c, false)[`${o.id}.validUntil`], "last day before first day is an error");
  o.validUntil = "2026-12-31";
  named(c); ok(Object.keys(validateContent(c, true)).length === 0, "valid offer publishes");
  const pub = snapshotOfContent(c).blocks.find((b) => b.type === "offer");
  ok(pub?.type === "offer" && pub.code === "SAVE10" && pub.validUntil === "2026-12-31", "offer snapshot keeps code and dates");
  const day = (s: string) => Date.parse(s + "T12:00:00Z");
  ok(offerState("2026-12-01", "2026-12-31", "Africa/Lagos", day("2026-11-20")) === "scheduled", "offer before its first day");
  ok(offerState("2026-12-01", "2026-12-31", "Africa/Lagos", day("2026-12-31")) === "active", "offer on its last day is still valid");
  ok(offerState("2026-12-01", "2026-12-31", "Africa/Lagos", day("2027-01-01")) === "expired", "offer after its last day is expired");
  ok(offerState("", "", "Africa/Lagos") === "active", "no dates: always valid");
  // last day in the owner's zone, not the server's: 23:30 UTC on Dec 31 is already Jan 1 in Lagos
  ok(offerState("", "2026-12-31", "Africa/Lagos", Date.UTC(2026, 11, 31, 23, 30)) === "expired", "expiry follows the offer's own time zone");
  o.title = "";
  ok(snapshotOfContent(c).blocks.every((b) => b.type !== "offer"), "an offer without a title is not published");
  ok(KIND_INFO.coupon.max.offer === 6 && KIND_INFO.campaign.max.offer === 3, "offer counts per kind");
  const camp = emptyContent("campaign");
  ok(validateContent(camp, true).page !== undefined, "campaign needs a button");
  const b = camp.blocks.find((x) => x.type === "button")!; Object.assign(b, { label: "Shop now", url: "example.com/sale" });
  const t = camp.blocks.find((x) => x.type === "text")!; Object.assign(t, { body: "Big sale" });
  named(camp); ok(Object.keys(validateContent(camp, true)).length === 0, "campaign publishes with a message and a button");
}

// ---- hostile input
for (const k of KINDS) {
  for (const j of [null, 5, "x", { blocks: [{ type: "items", categories: "no" }, { type: "event", startsAt: { a: 1 } }, { type: "offer", title: [] }] }, { blocks: [{ type: "items", categories: [null, 1, { items: [null, { name: { x: 1 } }] }] }] }]) {
    let c: PageContent | null = null; try { c = normaliseContent(k, j); validateContent(c, true); snapshotOfContent(c); } catch { c = null; }
    ok(!!c, `${k}: survives ${JSON.stringify(j)?.slice(0, 40)}`);
  }
  ok(readPageSnapshot({ v: 2, kind: k, accent: "forest", blocks: [{ id: "h", type: "header", name: "x", tagline: "" }, { id: "i", type: "items", categories: [{ id: "c", name: 5, items: [{ id: "a", name: "ok", price: "NaN" }, 7] }] }, { id: "e", type: "event" }, { id: "o", type: "offer" }] }) !== null, `${k}: damaged snapshot rows are dropped, not fatal`);
}
void emptyBlock;
if (bad) { console.log(`\n${bad} FAILED`); process.exit(1); } else console.log("\nall passed");
