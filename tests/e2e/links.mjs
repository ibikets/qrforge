// Dynamic links in a real browser against the built app + local stand-ins (NOT real Supabase): create, edit, route, pause, delete, stats, limits, safety.
import fs from "node:fs";
import { open, ctl, BASE, SP, sub, UID, staffSession } from "./lib.mjs";
let bad = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const OUT = `${SP}/links`; fs.mkdirSync(OUT, { recursive: true });
const axe = fs.readFileSync(process.env.AXE_PATH, "utf8");
const axeRes = async (pg) => { await pg.evaluate(axe); return pg.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })).violations.map((x) => x.id + ":" + x.nodes.map((n) => n.target.join(" ") + " " + (n.any[0]?.message ?? "")).join(" | "))); };
const UA = { ios: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148", android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120 Mobile", desk: "Mozilla/5.0 (Windows NT 10.0) Chrome/120", bot: "Slackbot-LinkExpanding 1.0" };
const hit = (slug, ua, method = "GET") => fetch(`${BASE}/l/${slug}`, { method, redirect: "manual", headers: ua ? { "user-agent": ua } : {} });
const api = (path, method, body, extra = {}) => fetch(BASE + path, { method, headers: { "content-type": "application/json", cookie: cookieHdr, ...extra }, body: body ? JSON.stringify(body) : undefined });
const links = async () => (await ctl()).tables.links ?? [];
const opens = async () => (await ctl()).log.filter((l) => l.op === "rpc" && l.fn === "record_link_open");
const L = (t) => page.getByLabel(t, { exact: true });

// ---- free plan
await ctl({ reset: true });
const { browser, context, page, logs } = await open({ width: 1280, height: 1400, signedIn: true });
const cookies = await context.cookies(); const cookieHdr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
await page.goto(BASE + "/workspace/links", { waitUntil: "domcontentloaded" });
await page.getByText("Dynamic links need Pro or Business").waitFor();
ok(!(await page.getByRole("button", { name: "Create link" }).count()), "free plan: sees the upgrade message, no create form");
let r = await api("/api/links", "POST", { name: "x", destination: "example.org" });
ok(r.status === 403 && (await r.json()).code === "plan", "free plan: the API refuses creation too");

// ---- business plan: create through the form
await ctl({ push: { subscriptions: [sub("business", 20)] } });
await page.goto(BASE + "/workspace/links", { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: "Create link" }).waitFor();
ok(/0 of 250 dynamic links used/.test(await page.locator("main").innerText()), "business plan: shows the quota");
await L("Link name").fill("Spring menu");
await L("Where should it go?").fill("javascript:alert(1)");
await page.getByRole("button", { name: "Create link" }).click();
await page.getByText(/Only web addresses/).waitFor();
ok((await links()).length === 0, "an unsafe address is refused and nothing is created");
await L("Where should it go?").fill("example.org/menu");
await page.getByRole("button", { name: "Create link" }).click();
await page.waitForURL(/\/workspace\/links\/[0-9a-f-]{36}$/);
await L("Main destination").waitFor();
const id = page.url().split("/").pop();
const row = (await links())[0];
ok(row.destination === "https://example.org/menu" && /^[a-z2-9]{8}$/.test(row.slug) && row.user_id === UID, "created with a normalised address and an opaque 8-character slug");
ok((await page.locator("code").first().innerText()).endsWith(`/l/${row.slug}`), "the permanent address is shown");
const slug = row.slug;

// ---- redirect basics
r = await hit(slug, UA.desk);
ok(r.status === 302 && r.headers.get("location") === "https://example.org/menu" && /no-store/.test(r.headers.get("cache-control")) && r.headers.get("referrer-policy") === "no-referrer" && /noindex/.test(r.headers.get("x-robots-tag")), "302 to the destination, never cached, no referrer, not indexed");
await new Promise((x) => setTimeout(x, 400));
let o = await opens();
ok(o.length === 1 && o[0].args.p_device === "other" && o[0].args.p_target === "default" && o[0].args.p_bot === false, "one GET records one open (computer, main destination, person)");
await hit(slug, UA.desk, "HEAD"); await hit(slug, UA.bot); await new Promise((x) => setTimeout(x, 400));
o = await opens();
ok(o.length === 2 && o[1].args.p_bot === true, "HEAD is not counted; a link-preview robot is counted as a preview");
ok((await hit("abcdefgh", UA.desk)).status === 404 && (await hit("ABC", UA.desk)).status === 404, "unknown and malformed addresses answer 404");

// ---- edit: new destination, phone addresses, an always-on iPhone rule
await L("Main destination").fill("example.org/summer");
await L("iPhone and iPad").fill("apps.apple.com/app/demo");
await L("Android").fill("play.google.com/store/apps/details?id=demo");
await page.getByRole("button", { name: "Save changes" }).click();
await page.getByText(/Saved\. The change is live/).waitFor();
r = await hit(slug, UA.desk); ok(r.headers.get("location") === "https://example.org/summer", "the new destination is live at once on the same address");
r = await hit(slug, UA.ios); ok(r.headers.get("location") === "https://apps.apple.com/app/demo", "iPhone goes to the App Store address");
r = await hit(slug, UA.android); ok(r.headers.get("location") === "https://play.google.com/store/apps/details?id=demo", "Android goes to the Play Store address");
r = await hit(slug, null); ok(r.headers.get("location") === "https://example.org/summer", "no browser name: main destination");
ok((await links())[0].version === 2, "saving bumps the version");

await page.getByRole("button", { name: "Add a day and time rule" }).click();
await L("Go to").fill("example.org/anytime-android");
await page.getByLabel("For", { exact: true }).selectOption("android");
for (const d of ["Saturday", "Sunday"]) await page.getByRole("checkbox", { name: d }).check();
await L("From").fill("00:00"); await L("Until").fill("23:59"); await L("Time zone").fill("UTC");
await page.getByRole("button", { name: "Save changes" }).click();
await page.getByText(/Saved\. The change is live/).waitFor();
r = await hit(slug, UA.android); ok(r.headers.get("location") === "https://example.org/anytime-android", "a matching day/time rule beats the phone address");
r = await hit(slug, UA.ios); ok(r.headers.get("location") === "https://apps.apple.com/app/demo", "the Android-only rule does not affect iPhone");
await new Promise((x) => setTimeout(x, 400));
o = await opens();
ok(o.some((x) => x.args.p_target === "schedule" && x.args.p_device === "android") && o.some((x) => x.args.p_target === "device" && x.args.p_device === "ios"), "opens record which kind of rule sent the visitor");

// ---- validation in the editor
await L("Go to").fill("ftp://nope.example.org");
await page.getByRole("button", { name: "Save changes" }).click();
await page.getByText(/Only web addresses/).first().waitFor();
ok((await links())[0].rules.schedule[0].url === "https://example.org/anytime-android", "an invalid rule is not saved");
await L("Go to").fill("example.org/anytime-android");
await L("From").fill("18:00"); await L("Until").fill("09:00");
await page.getByRole("button", { name: "Save changes" }).click();
await page.getByText(/The end must be after the start/).first().waitFor();
ok(true, "end before start is explained");
await L("From").fill("00:00"); await L("Until").fill("23:59");

// ---- conflicts, ownership, cross-site
const cur = (await links())[0];
r = await api(`/api/links/${id}`, "PATCH", { name: "Stale", destination: "example.org/x", rules: {}, version: cur.version - 1 });
ok(r.status === 409 && (await r.json()).code === "conflict" && (await links())[0].name === "Spring menu", "a stale save is refused with a conflict and changes nothing");
r = await api(`/api/links/${id}`, "PATCH", { name: "X", destination: "example.org/x", rules: {}, version: cur.version }, { origin: "https://evil.example" });
ok(r.status === 403, "cross-site save refused");
const other = { id: "22222222-2222-4222-8222-222222222222", user_id: "99999999-9999-4999-8999-999999999999", name: "Theirs", slug: "zzzzzzzz", destination: "https://theirs.example.org/", rules: {}, state: "active", version: 1, taken_down_at: null, deleted_at: null };
await ctl({ tables: { links: [...(await links()), other] } });
r = await api(`/api/links/${other.id}`, "PATCH", { name: "Mine now", destination: "example.org", rules: {}, version: 1 }); ok(r.status === 404, "another customer's link cannot be edited");
r = await api(`/api/links/${other.id}`, "DELETE"); ok(r.status === 404, "another customer's link cannot be deleted");
r = await fetch(`${BASE}/api/links/${other.id}/qr`, { headers: { cookie: cookieHdr } }); ok(r.status === 404, "another customer's QR code cannot be fetched");
r = await api(`/api/links/${id}`, "PATCH", { name: "Bad", destination: `${BASE}/l/abcdefgh`, rules: {}, version: cur.version });
ok(r.status === 400 && (await links())[0].name === "Spring menu", "an internal or local address is refused and nothing is saved (the own-site loop guard is covered in tests/links.ts)");

// ---- QR download
r = await fetch(`${BASE}/api/links/${id}/qr?format=svg`, { headers: { cookie: cookieHdr } });
ok(r.status === 200 && /svg/.test(r.headers.get("content-type")) && (await r.text()).includes("<svg"), "SVG QR code downloads");
r = await fetch(`${BASE}/api/links/${id}/qr?format=png`, { headers: { cookie: cookieHdr } });
const png = Buffer.from(await r.arrayBuffer()); ok(r.status === 200 && png.slice(1, 4).toString() === "PNG", "PNG QR code downloads");

// ---- reporting failure must never stop a valid redirect
await ctl({ rpc: { record_link_open: { __status: 500, __body: { code: "XX000", message: "counter down" } } } });
r = await hit(slug, UA.desk); ok(r.status === 302 && r.headers.get("location") === "https://example.org/summer", "if the counter fails, the visitor is still redirected");
await ctl({ rpc: { record_link_open: null } });

// ---- pause / resume
await page.reload({ waitUntil: "domcontentloaded" }); await L("Main destination").waitFor();
await page.getByRole("button", { name: "Pause link" }).click(); await page.getByText(/^Paused\./).waitFor();
r = await hit(slug, UA.desk); const body = await r.text();
ok(r.status === 200 && /switched off/.test(body) && !r.headers.get("location"), "a paused link shows a notice instead of redirecting");
await new Promise((x) => setTimeout(x, 400)); o = await opens(); ok(o.at(-1).args.p_target === "paused", "opens while paused are counted separately");
await page.getByRole("button", { name: "Resume link" }).click(); await page.getByText("Resumed.").waitFor();
ok((await hit(slug, UA.desk)).status === 302, "resumed link redirects again");

// ---- stats are labelled honestly
const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
await ctl({ tables: { link_daily: [{ link_id: id, day: day(0), device: "ios", target: "device", bot: false, opens: 7 }, { link_id: id, day: day(1), device: "other", target: "default", bot: false, opens: 4 }, { link_id: id, day: day(2), device: "other", target: "default", bot: true, opens: 6 }, { link_id: id, day: day(200), device: "other", target: "default", bot: false, opens: 50 }] } });
await page.reload({ waitUntil: "domcontentloaded" });
const stats = page.locator("section[aria-labelledby=stats-h]"); await stats.waitFor();
const st = await stats.innerText();
ok(/not a person|It is not a person/.test(st) && /previews/i.test(st) && /UTC/.test(st) && !/unique/i.test(st.replace(/not unique|unique visitors/gi, "")), "the stats explain what an open is and is not");
const dd = async (label) => (await stats.locator(`dt:text-is("${label}") + dd`).innerText()).replace(/,/g, "");
ok(+(await dd("Opens")) >= 11 && (await dd("Previews and robots")) === "6" && +(await dd("All-time opens")) >= 61, "totals: people, previews and all-time are separate");
await page.screenshot({ path: `${OUT}/editor-desktop.png`, fullPage: true });
const v1 = await axeRes(page); ok(v1.length === 0, "editor + stats: no accessibility violations" + (v1.length ? " " + v1.join(" ; ") : ""));
await page.goto(BASE + "/workspace/links", { waitUntil: "domcontentloaded" }); await page.getByText("Spring menu").waitFor();
ok((await page.locator("main").innerText()).includes("goes to https://example.org/summer"), "the list shows where each link goes");
await page.screenshot({ path: `${OUT}/list-desktop.png`, fullPage: true });
const v2 = await axeRes(page); ok(v2.length === 0, "list: no accessibility violations" + (v2.length ? " " + v2.join(" ; ") : ""));

// ---- mobile
await page.setViewportSize({ width: 390, height: 900 });
await page.goto(`${BASE}/workspace/links/${id}`, { waitUntil: "domcontentloaded" }); await L("Main destination").waitFor();
ok(((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0), "editor does not scroll sideways at 390px");
await page.screenshot({ path: `${OUT}/editor-mobile.png`, fullPage: true });
await page.setViewportSize({ width: 1280, height: 1400 });

// ---- delete
await page.goto(`${BASE}/workspace/links/${id}`, { waitUntil: "domcontentloaded" }); await L("Main destination").waitFor();
await page.getByRole("button", { name: "Delete link" }).first().click();
await page.getByRole("dialog").getByRole("button", { name: "Delete link" }).click();
await page.waitForURL(/\/workspace\/links$/);
r = await hit(slug, UA.desk); ok(r.status === 410, "a deleted link answers 410 and never redirects");
ok(!(await page.locator("main").innerText()).includes("Spring menu"), "it disappears from the list");
r = await api("/api/links", "POST", { name: "Again", destination: "example.org/again" }); const again = await r.json();
ok(r.status === 200 && (await links()).find((x) => x.id === again.id).slug !== slug, "a new link never reuses a deleted address");

// ---- takedown, grace and lapse
const live0 = (await links()).find((x) => x.id === again.id);
const setLive = async (patch) => { const all = await links(); Object.assign(all.find((x) => x.id === again.id), patch); await ctl({ tables: { links: all } }); return all.find((x) => x.id === again.id); };
const SID = (n) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
await ctl({ tables: { staff_members: [
  { user_id: SID(1), email: "owner@example.com", role: "owner", extra_grants: [], state: "active", version: 1 },
  { user_id: SID(2), email: "support@example.com", role: "support", extra_grants: [], state: "active", version: 1 },
  { user_id: SID(4), email: "editor@example.com", role: "content_editor", extra_grants: [], state: "active", version: 1 },
] } });
const support = await staffSession(SID(2), "support@example.com"); const editor = await staffSession(SID(4), "editor@example.com");
const staffCall = async (cookie, action, reason = "Abuse report #4821", origin = BASE) => (await fetch(`${BASE}/api/admin/links`, { method: "POST", headers: { "content-type": "application/json", cookie, origin }, body: JSON.stringify({ action, link_id: again.id, reason }) })).status;
ok((await staffCall(editor, "takedown")) === 403, "staff: a Content Editor cannot disable a link");
ok((await staffCall(await staffSession(SID(2), "support@example.com", { lastSignIn: Date.now() - 20 * 60e3 }), "takedown")) === 403, "staff: disabling needs a recent sign-in (step-up)");
ok((await staffCall(support, "takedown", "x")) === 422, "staff: disabling needs a real reason");
ok((await staffCall(support, "takedown", "Abuse report #4821", "https://evil.example")) === 403, "staff: cross-site request refused");
ok((await staffCall(support, "restore")) === 409, "staff: restoring a link that is not disabled is refused");
const lpg = await (await fetch(`${BASE}/admin/links`, { headers: { cookie: support } })).text();
ok(lpg.includes(live0.slug) && /Disable/.test(lpg) && !/Again/.test(lpg), "staff list shows the address and destination but not the customer's name for the link");
ok(!/Disable/.test(await (await fetch(`${BASE}/admin/links`, { headers: { cookie: editor } })).text()), "staff: a Content Editor sees no links screen actions");
ok((await staffCall(support, "takedown")) === 200, "staff: Support disables a link");
ok((await staffCall(support, "takedown")) === 409, "staff: disabling twice is refused");
let live = (await links()).find((x) => x.id === again.id);
r = await hit(live.slug, UA.desk); ok(r.status === 410, "a link disabled by staff answers 410");
r = await api(`/api/links/${live.id}`, "PATCH", { state: "paused", version: live.version }); ok(r.status === 403, "the owner cannot re-enable or change a disabled link");
await page.goto(`${BASE}/workspace/links/${live.id}`, { waitUntil: "domcontentloaded" }); await page.getByText(/Qrenuvi disabled this link/).waitFor(); ok(true, "the editor tells the owner it was disabled");
ok((await staffCall(support, "restore")) === 200, "staff: Support re-enables the link");
live = (await links()).find((x) => x.id === again.id);
ok((await hit(live.slug, UA.desk)).status === 302, "a re-enabled link redirects again");
const audits = ((await ctl()).tables.audit_events ?? []).filter((a) => a.action?.startsWith("link."));
ok(audits.length === 2 && audits.every((a) => a.target_type === "link" && a.actor_role === "support" && a.reason === "Abuse report #4821") && !JSON.stringify(audits).includes("Again"), "both staff actions audited with actor, role and reason, and no link name");
await ctl({ set: { subscriptions: [sub("business", -3)] } });
ok((await hit(live.slug, UA.desk)).status === 302, "3 days after the plan ends the link still works (7-day grace)");
await ctl({ set: { subscriptions: [sub("business", -9)] } });
ok((await hit(live.slug, UA.desk)).status === 410, "9 days after the plan ends the link stops");
await page.goto(`${BASE}/workspace/links/${live.id}`, { waitUntil: "domcontentloaded" });
await page.getByText(/no longer includes editing/).waitFor(); ok(!(await page.getByRole("button", { name: "Save changes" }).count()), "lapsed plan: editing is locked, pause and delete remain");
r = await api(`/api/links/${live.id}`, "PATCH", { name: "n", destination: "example.org/z", rules: {}, version: live.version }); ok(r.status === 403, "lapsed plan: the API refuses edits");
r = await api(`/api/links/${live.id}`, "PATCH", { state: "paused", version: live.version }); ok(r.status === 200, "lapsed plan: the owner can still pause");

// ---- quota (stand-in mirrors the database limit; the real trigger is tested in tests/db/links.test.mjs)
await ctl({ set: { subscriptions: [sub("pro", 20)] } });
await ctl({ tables: { links: [] } });
const many = Array.from({ length: 25 }, (_, i) => ({ id: crypto.randomUUID(), user_id: UID, name: "n" + i, slug: "aaaaaa" + String(i).padStart(2, "2"), destination: "https://e.example.org/", rules: {}, state: "active", version: 1, taken_down_at: null, deleted_at: null }));
await ctl({ tables: { links: many } });
r = await api("/api/links", "POST", { name: "26th", destination: "example.org" }); const lim = await r.json();
ok(r.status === 403 && lim.code === "limit" && /25 dynamic links/.test(lim.error), "over the plan limit: clear message");
await page.goto(BASE + "/workspace/links", { waitUntil: "domcontentloaded" }); await page.getByText(/used every link on your plan/).waitFor(); ok(true, "the list explains when every link is used");

ok(logs.filter((l) => !/status of (4\d\d|5\d\d)/.test(l)).length === 0, "no unexpected browser console errors" + (logs.length ? " " + logs.join(" | ") : ""));
await browser.close();
console.log(bad ? `${bad} FAILED` : "all passed"); process.exit(bad ? 1 : 0);
