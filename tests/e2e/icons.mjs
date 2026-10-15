// Icon action bar + social icons + Save contact behaviour on a published card, in a real browser (stand-ins, not real Supabase/phones).
import fs from "node:fs";
import { open, ctl, BASE, sub, actionHref } from "./lib.mjs";
const axeSrc = fs.readFileSync(process.env.AXE_PATH ?? "node_modules/axe-core/axe.min.js", "utf8");
let bad = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
await ctl({ reset: true }); await ctl({ push: { subscriptions: [sub("pro", 20)] } });
const { browser, context, page, logs } = await open({ width: 1280, height: 900, signedIn: true });
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
const api = (path, method, body) => page.evaluate(async ([p, m, b]) => { const r = await fetch(p, { method: m, headers: { "content-type": "application/json" }, body: JSON.stringify(b) }); return { status: r.status, j: await r.json().catch(() => ({})) }; }, [path, method, body]);
await page.goto(BASE + "/workspace/pages", { waitUntil: "domcontentloaded" });
const made = await api("/api/pages", "POST", { title: "Icons" });
const id = made.j.id;
const row = (i, label, value, extra = {}) => ({ id: "r" + i, label, value, public: true, ...extra });
const card = { name: "Ada Obi", role: "PM", company: "Acme", intro: "", accent: "forest", portraitId: null, logoId: null,
  phones: [row(1, "mobile", "+234 803 123 4567", { whatsapp: true }), row(2, "work", "+234 802 000 1111")],
  emails: [row(3, "work", "ada@example.com"), row(4, "home", "ada.home@example.com")],
  websites: [row(5, "", "acme.example"), row(6, "", "blog.example.net")],
  socials: [row(7, "instagram", "ada.obi"), row(8, "linkedin", "ada-obi"), row(9, "x", "adaobi"), row(10, "other", "https://example.social/ada")] };
const saved = await api(`/api/pages/${id}`, "PUT", { title: "Icons", card, expectedVersion: 1 });
ok(saved.status === 200, "card saved");
const pub = await api(`/api/pages/${id}/publish`, "POST", { expectedVersion: saved.j.version });
ok(pub.status === 200, "card published");
const publicId = (await ctl()).tables.pages.find((p) => p.id === id).public_id;

const ap = await (await browser.newContext({ viewport: { width: 390, height: 900 }, hasTouch: true, isMobile: true })).newPage();
await ap.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
await ap.goto(`${BASE}/p/${publicId}`, { waitUntil: "domcontentloaded" });
await ap.getByRole("heading", { name: "Ada Obi" }).waitFor();

// every action is an icon with an accessible name and a >= 44px target
const targets = await ap.evaluate(() => [...document.querySelectorAll("article ul li > a[aria-label], article ul li > button[aria-label]")].map((e) => ({ n: e.getAttribute("aria-label"), w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height })));
ok(targets.length >= 10 && targets.every((t) => t.n && t.w >= 44 && t.h >= 44), `all ${targets.length} icon controls are named and at least 44x44 (${targets.map((t) => Math.round(t.w)).join(",")})`);
ok(await ap.getByRole("button", { name: "Call: choose from 2" }).isVisible() && await ap.getByRole("button", { name: "Email: choose from 2" }).isVisible() && await ap.getByRole("button", { name: "Website: choose from 2" }).isVisible(), "several numbers / emails / websites -> a chooser, not a dropped entry");
ok(await ap.getByRole("link", { name: /^WhatsApp:/ }).getAttribute("href") === "https://wa.me/2348031234567", "WhatsApp icon -> wa.me link");

// chooser lists every entry, Escape closes it and returns focus
const callBtn = ap.getByRole("button", { name: "Call: choose from 2" });
await callBtn.click();
const opts = await ap.getByRole("group", { name: "Call options" }).getByRole("link").evaluateAll((a) => a.map((x) => x.getAttribute("href")));
ok(JSON.stringify(opts) === JSON.stringify(["tel:+2348031234567", "tel:+2348020001111"]), "chooser lists both phone numbers as tel: links");
ok(await callBtn.getAttribute("aria-expanded") === "true", "trigger reports expanded");
await ap.keyboard.press("Escape");
ok(await ap.getByRole("group", { name: "Call options" }).count() === 0 && await ap.evaluate(() => document.activeElement?.getAttribute("aria-label")) === "Call: choose from 2", "Escape closes the chooser and returns focus to the icon");
ok(JSON.stringify(await (async () => { const o = []; for (const k of ["Email", "Website"]) { const b = ap.getByRole("button", { name: new RegExp("^" + k + ": choose") }); await b.click(); o.push((await ap.getByRole("group", { name: k + " options" }).getByRole("link").evaluateAll((a) => a.map((x) => x.getAttribute("href"))))); await b.click(); } return o; })()) === JSON.stringify([["mailto:ada@example.com", "mailto:ada.home@example.com"], ["https://acme.example/", "https://blog.example.net/"]]), "emails and websites choosers list every entry with mailto:/https links");

// social icons: every profile, brand-named, safe https
const soc = await ap.getByRole("region", { name: "Social profiles" }).getByRole("link").evaluateAll((a) => a.map((x) => [x.getAttribute("aria-label"), x.getAttribute("href"), x.getAttribute("rel")]));
ok(soc.length === 4 && soc[0][0] === "Instagram: instagram.com/ada.obi".replace("instagram.com/", "") || soc[0][0].startsWith("Instagram:"), "social icons carry platform names");
ok(soc.every((s) => /^https:\/\//.test(s[1]) && /noopener/.test(s[2] ?? "")), "social links are https with rel=noopener");
ok(await ap.locator("svg[aria-hidden=true]").count() >= 10, "icons are decorative SVGs (names come from text)");
ok(!(await ap.content()).match(/[\u{1F300}-\u{1FAFF}]/u), "no emoji in the page");

// share: no native share -> copies the link and says so
await ap.evaluate(() => { Object.defineProperty(navigator, "share", { value: undefined, configurable: true }); });
await ap.getByRole("button", { name: "Share this page" }).click();
await ap.getByText("Link copied").first().waitFor();
ok((await ap.evaluate(() => navigator.clipboard.readText())).includes(`/p/${publicId}`), "Share falls back to copying the link");
// share: native sheet when present
await ap.evaluate(() => { window.__shared = null; Object.defineProperty(navigator, "share", { value: async (d) => { window.__shared = d; }, configurable: true }); });
await ap.getByRole("button", { name: "Share this page" }).click();
ok((await ap.evaluate(() => window.__shared))?.url?.includes(`/p/${publicId}`), "Share uses the native share sheet when the browser has one");

// save contact: plain link (no forced download), inline response, correct card
const save = ap.getByRole("link", { name: "Save contact to your phone" });
ok(await save.getAttribute("download") === null && (await save.getAttribute("href")) === `/p/${publicId}/contact.vcf`, "Save contact is a plain link with no download attribute");
ok(await ap.getByText("Save contact", { exact: true }).isVisible(), "Save contact keeps a visible label");
const v = await ap.request.get(`${BASE}/p/${publicId}/contact.vcf`);
const vt = await v.text();
ok(v.headers()["content-type"].startsWith("text/vcard") && /^inline; filename="Ada-Obi\.vcf"$/.test(v.headers()["content-disposition"]), "contact response is text/vcard, inline, safe filename");
ok(vt.includes("FN:Ada Obi") && vt.includes("+234 803 123 4567") && vt.includes("+234 802 000 1111") && vt.includes("ada.home@example.com") && vt.includes("blog.example.net"), "contact file keeps every published method");

// layout + a11y at 390 and 200% zoom
ok(await ap.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no horizontal scroll at 390");
await ap.addScriptTag({ content: axeSrc });
const ax = await ap.evaluate(async () => (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })).violations.map((x) => x.id + ":" + x.nodes.length));
ok(ax.length === 0, "axe: no WCAG 2.1 AA violations on the public card " + ax.join(","));
const z = await (await browser.newContext({ viewport: { width: 640, height: 900 }, deviceScaleFactor: 2 })).newPage();
await z.goto(`${BASE}/p/${publicId}`, { waitUntil: "domcontentloaded" }); await z.getByRole("heading", { name: "Ada Obi" }).waitFor();
await z.addStyleTag({ content: "html{zoom:2}" });
ok(await z.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "200% zoom: content reflows without horizontal scroll");

// editor preview is honest about Save contact
await page.goto(`${BASE}/workspace/pages/${id}`, { waitUntil: "domcontentloaded" });
await page.getByRole("complementary", { name: "Live preview" }).getByText("Preview only. Save contact works on the published page.").waitFor();
ok(true, "editor preview explains that Save contact works once published");
ok(logs.filter((l) => !/Failed to load resource/.test(l)).length === 0, "no browser errors " + logs.slice(0, 2).join("|"));
await browser.close();
console.log(bad ? `\n${bad} FAILED` : "\nall passed"); process.exit(bad ? 1 : 0);
