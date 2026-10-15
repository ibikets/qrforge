// Section-built pages (business / links / social). Run: npx tsx tests/pages-blocks.ts
import {
  KIND_INFO, emptyContent, normaliseContent, validateContent, snapshotOfContent, readPageSnapshot, snapshotMediaIds, contentMedia, orgContact, orgVcf, mapHref, validTimeZone,
  type Block, type PageContent,
} from "../lib/pages/blocks";
import { engineFor, isPageKind } from "../lib/pages/kinds";

let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const get = <T extends Block["type"]>(c: PageContent, t: T) => c.blocks.find((b) => b.type === t) as Extract<Block, { type: T }>;
const U1 = "11111111-1111-4111-8111-111111111111", U2 = "22222222-2222-4222-8222-222222222222";

// ---- new pages & presets
for (const k of ["business", "links", "social"] as const) {
  const c = emptyContent(k);
  ok(c.blocks[0].type === "header" && c.v === 2 && c.kind === k, `${k}: starts with a header`);
  ok(c.blocks.slice(1).every((b) => KIND_INFO[k].allow.includes(b.type as never)), `${k}: only allowed sections`);
  ok(Object.keys(validateContent(c, false)).length === 0, `${k}: an empty draft saves`);
  ok(Object.keys(validateContent(c, true)).length > 0, `${k}: an empty page cannot be published`);
}
ok(isPageKind("business") && isPageKind("card") && !isPageKind("menu") && !isPageKind(null), "page kinds are a closed list");
ok(engineFor("menu") === null && engineFor("card") !== null && engineFor("links") !== null, "unknown kind has no engine");

// ---- normalisation of hostile input never throws and enforces structure
const junk: unknown[] = [null, undefined, 5, "x", [], {}, { blocks: "no" }, { blocks: [null, 1, "a", {}, { type: "evil" }] }, { blocks: [{ type: "header", name: { a: 1 } }] }];
for (const j of junk) { let c: PageContent | null = null; try { c = normaliseContent("business", j); } catch { /* */ } ok(!!c && c.blocks[0].type === "header", `normalise survives ${JSON.stringify(j)?.slice(0, 40)}`); }
{
  const c = normaliseContent("social", { blocks: [{ type: "hours" }, { type: "header", name: "A" }, { type: "header", name: "B" }, { type: "socials", items: [] }, { type: "socials", items: [] }] });
  ok(c.blocks.filter((b) => b.type === "header").length === 1 && c.blocks[0].type === "header" && (c.blocks[0] as { name: string }).name === "A", "one header, first wins");
  ok(!c.blocks.some((b) => b.type === "hours"), "social pages drop a business-only section");
  ok(c.blocks.filter((b) => b.type === "socials").length === 1, "section counts are capped by kind");
  const l = normaliseContent("links", { blocks: [{ type: "header", logoId: U1, portraitId: U2 }] });
  ok(contentMedia(l).length === 2, "links pages keep portrait and logo");
  const s = normaliseContent("social", { blocks: [{ type: "header", logoId: U1, portraitId: U2 }] });
  ok(contentMedia(s).length === 1 && contentMedia(s)[0].kind === "portrait", "social pages have no logo");
  const d = normaliseContent("business", { blocks: [{ id: "x", type: "text" }, { id: "x", type: "text" }, { id: "../../", type: "text" }] });
  ok(new Set(d.blocks.map((b) => b.id)).size === d.blocks.length && d.blocks.every((b) => /^[a-z0-9_-]{1,24}$/i.test(b.id)), "ids are unique and safe");
  ok(normaliseContent("business", { blocks: [{ type: "header", portraitId: "not-a-uuid" }] }).blocks[0].type === "header" && contentMedia(normaliseContent("business", { blocks: [{ type: "header", portraitId: "not-a-uuid" }] })).length === 0, "non-UUID media ids are dropped");
}

// ---- publishing rules and the snapshot allowlist
const biz = (): PageContent => {
  const c = emptyContent("business");
  (c.blocks[0] as { name: string }).name = "Acme Ltd";
  return c;
};
{
  const c = biz();
  const a = get(c, "actions");
  a.phones[0].value = "+234 803 123 4567"; a.phones[0].whatsapp = true;
  a.emails[0].value = "hello@acme.ng";
  a.websites[0].value = "acme.ng";
  a.phones.push({ id: "priv", label: "mobile", value: "0801 000 0000", public: false });
  get(c, "location").address = "12 Marina Road\nLagos";
  const h = get(c, "hours"); h.timezone = "Africa/Lagos";
  get(c, "text").body = "We fix things.";
  ok(Object.keys(validateContent(c, true)).length === 0, "a filled business page publishes");
  const s = snapshotOfContent(c);
  const js = JSON.stringify(s);
  ok(!js.includes("0801") && !js.includes("priv"), "private rows never reach the snapshot");
  ok(s.blocks.some((b) => b.type === "location" && b.mapHref === mapHref("12 Marina Road\nLagos")), "location carries a built maps link");
  const act = s.blocks.find((b) => b.type === "actions");
  ok(act?.type === "actions" && act.phones[0].href === "tel:+2348031234567" && act.phones[0].whatsapp === "https://wa.me/2348031234567" && act.websites[0].href === "https://acme.ng/", "actions links are built, not copied");
  const back = readPageSnapshot(JSON.parse(js));
  ok(!!back && back.blocks.length === s.blocks.length, "snapshot round-trips");
  ok(readPageSnapshot({ v: 1 }) === null && readPageSnapshot(null) === null && readPageSnapshot({ v: 2, kind: "menu", blocks: [] }) === null, "foreign or old snapshots are not read as pages");
  c.blocks.find((b) => b.type === "location")!.hidden = true;
  ok(!snapshotOfContent(c).blocks.some((b) => b.type === "location"), "hidden sections are not published");
  const eng = engineFor("business")!;
  const restored = eng.fromSnapshot(s) as PageContent;
  ok(!JSON.stringify(restored).includes("0801"), "restored draft contains only what was public");
  ok(JSON.stringify(eng.snapshot(restored)) === JSON.stringify(s), "snapshot -> draft -> snapshot is stable");
  const v = orgVcf(s)!;
  ok(v.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\nN:;;;;\r\nFN:Acme Ltd") && v.includes("X-ABShowAs:COMPANY") && v.includes("ADR;TYPE=WORK:;;12 Marina Road\\, Lagos;;;;"), "business contact file is an organisation card with an address");
  ok(!v.includes("PHOTO") && !v.includes("0801") && v.includes("TEL;TYPE=WORK:+234 803 123 4567") && v.endsWith("END:VCARD\r\n"), "no photo, no private numbers, CRLF");
  ok(orgContact(snapshotOfContent(emptyContent("business"))) === null, "no contact file when there is nothing to save");
}

// ---- links
{
  const c = emptyContent("links");
  (c.blocks[0] as { name: string }).name = "Ada";
  const l = get(c, "links");
  l.items = [
    { id: "a", label: "Shop", url: "shop.example.com", note: "" },
    { id: "b", label: "Bad", url: "javascript:alert(1)", note: "" },
    { id: "c", label: "", url: "example.org", note: "" },
    { id: "d", label: "Half", url: "", note: "" },
    { id: "e", label: "Dup", url: "https://shop.example.com", note: "" },
  ];
  const e = validateContent(c, true);
  ok(!!e[`${l.id}.items.b`], "javascript: link refused");
  ok(!!e[`${l.id}.items.c`] && !!e[`${l.id}.items.d`], "publishing needs label and address together");
  ok(!!e[`${l.id}.items.e`], "duplicate address flagged");
  ok(Object.keys(validateContent(c, false)).length === 2 || !!validateContent(c, false)[`${l.id}.items.b`], "drafts still flag unsafe addresses");
  const s = snapshotOfContent(c);
  const sl = s.blocks.find((b) => b.type === "links");
  ok(sl?.type === "links" && sl.items.length === 2 && sl.items.every((i) => /^https?:\/\//.test(i.href)), "snapshot keeps only finished, valid links");
  l.items = Array.from({ length: 40 }, (_, i) => ({ id: "i" + i, label: "L" + i, url: `e${i}.com`, note: "" }));
  ok(get(normaliseContent("links", c), "links").items.length === 30, "link count capped at 30");
  // reordering is the stored order
  l.items = [{ id: "x", label: "One", url: "one.com", note: "" }, { id: "y", label: "Two", url: "two.com", note: "" }];
  const order = (cc: PageContent) => (snapshotOfContent(cc).blocks.find((b) => b.type === "links") as { items: { label: string }[] }).items.map((i) => i.label).join(",");
  const first = order(c); l.items.reverse();
  ok(first === "One,Two" && order(c) === "Two,One", "link order follows the editor");
  const noLinks = emptyContent("links"); (noLinks.blocks[0] as { name: string }).name = "Ada";
  ok(!!validateContent(noLinks, true).page, "multi-link page needs at least one link");
}

// ---- social
{
  const c = emptyContent("social");
  (c.blocks[0] as { name: string }).name = "Ada";
  const so = get(c, "socials");
  so.items = [{ id: "a", label: "instagram", value: "@ada.o", public: true }, { id: "b", label: "instagram", value: "ada.o", public: true }, { id: "c", label: "x", value: "bad handle with spaces", public: true }];
  const e = validateContent(c, true);
  ok(!!e[`${so.id}.items.b`], "same profile twice is flagged");
  ok(!!e[`${so.id}.items.c`], "invalid handle is flagged");
  so.items = [so.items[0]];
  ok(Object.keys(validateContent(c, true)).length === 0, "one valid profile publishes");
  const s = snapshotOfContent(c);
  const sl = s.blocks.find((b) => b.type === "socials");
  ok(sl?.type === "socials" && /^https:\/\/(www\.)?instagram\.com\//.test(sl.items[0].href), "profile address is built from the handle");
  ok(snapshotMediaIds(s).length === 0, "no media by default");
}

// ---- hours & time zones
{
  ok(validTimeZone("Africa/Lagos") && validTimeZone("America/New_York") && !validTimeZone("Mars/Base") && !validTimeZone(""), "time zone check");
  const c = biz(); get(c, "actions").phones[0].value = "08031234567";
  const h = get(c, "hours");
  h.days[0] = { closed: false, open: "09:00", close: "09:00" };
  h.days[1] = { closed: false, open: "9am", close: "17:00" };
  h.timezone = "Nowhere/City";
  const e = validateContent(c, false);
  ok(!!e[`${h.id}.day.0`] && !!e[`${h.id}.day.1`] && !!e[`${h.id}.timezone`], "bad hours and time zone flagged");
  h.timezone = "Africa/Lagos"; h.days[0] = { closed: false, open: "08:30", close: "18:00" }; h.days[1] = { closed: true, open: "", close: "" };
  const s = snapshotOfContent(c);
  const sh = s.blocks.find((b) => b.type === "hours");
  ok(sh?.type === "hours" && sh.timezone === "Africa/Lagos" && sh.days[0].open === "08:30" && sh.days[1].closed, "hours stored with their time zone");
  h.days = h.days.map(() => ({ closed: true, open: "09:00", close: "17:00" }));
  ok(!snapshotOfContent(c).blocks.some((b) => b.type === "hours"), "all-closed hours are not shown");
}

// ---- text safety: plain text only
{
  const c = biz(); get(c, "text").body = "<script>alert(1)</script> & <b>x</b>\u0007";
  ok(!!validateContent(c, false)[`${get(c, "text").id}.body`], "control characters refused");
  get(c, "text").body = "<script>alert(1)</script>";
  const s = snapshotOfContent(c);
  ok(JSON.stringify(s).includes("<script>"), "markup is kept as inert text (the page renders text, never HTML)");
}
console.log(bad ? `\n${bad} FAILED` : "\nall passed");
process.exit(bad ? 1 : 0);
