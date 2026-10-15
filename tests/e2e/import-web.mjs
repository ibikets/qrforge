// Website import in a real browser against the built app + a local fixture website (NOT the internet). The app is started with
// IMPORT_FETCH_TEST_ORIGINS=http://127.0.0.1:54400, a test-only allowance that is ignored on Vercel.
import fs from "node:fs";
import http from "node:http";
import zlib from "node:zlib";
import { open, ctl, BASE, SP, sub } from "./lib.mjs";
let bad = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const OUT = `${SP}/importweb`; fs.mkdirSync(OUT, { recursive: true });
const axe = fs.readFileSync(process.env.AXE_PATH, "utf8");
const axeRes = async (pg) => { await pg.evaluate(axe); return pg.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })).violations.map((x) => x.id + ":" + x.nodes.map((n) => n.target.join(" ")).join("|"))); };
const overflow = (pg) => pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const O = "http://127.0.0.1:54400"; const hits = [];
const ld = (o) => `<html><head><script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script></head><body>shop</body></html>`;
const srv = http.createServer((req, res) => {
  hits.push(req.url);
  const html = (b, st = 200) => { res.writeHead(st, { "content-type": "text/html" }); res.end(b); };
  if (req.url === "/robots.txt") { res.writeHead(200, { "content-type": "text/plain" }); return res.end("User-agent: *\nDisallow: /nope\n"); }
  if (req.url === "/shop") return html(ld({ "@graph": [
    { "@type": "Product", name: "Leather tote", sku: "TOTE-1", description: "Hand-stitched", category: "Bags", url: "https://shop.example.com/p/tote", offers: { price: "28000", priceCurrency: "NGN", availability: "InStock" } },
    { "@type": "Product", name: "Mini purse", sku: "PURSE-1", offers: { price: "9500", priceCurrency: "NGN" } },
    { "@type": "Product", name: "Dollar bag", sku: "USD-1", offers: { price: "20", priceCurrency: "USD" } },
    { "@type": "Product", name: "Mystery bag", sku: "MYST-1" }] }));
  if (req.url === "/nope") return html(ld({ "@type": "Product", name: "Hidden" }));
  if (req.url === "/wall") return html("denied", 403);
  if (req.url === "/plain") return html("<html><body><h1>Menu</h1><p>Rice 2000</p></body></html>");
  if (req.url === "/to-internal") { res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data" }); return res.end(); }
  if (req.url === "/bomb") { res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" }); return res.end(zlib.gzipSync(Buffer.alloc(60 * 1024 * 1024, 97))); }
  if (req.url === "/pdf") { res.writeHead(200, { "content-type": "application/pdf" }); return res.end("%PDF"); }
  html("nf", 404);
});
await new Promise((r) => srv.listen(54400, "127.0.0.1", r));

await ctl({ reset: true }); await ctl({ push: { subscriptions: [sub("business", 20)] } });
const { browser, context, page, logs } = await open({ width: 1280, height: 1500, signedIn: true });
const cookieHdr = (await context.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
const api = (path, method, body) => fetch(BASE + path, { method, headers: { "content-type": "application/json", cookie: cookieHdr }, body: JSON.stringify(body) });
const pg = async (id) => (await ctl()).tables.pages.find((p) => p.id === id);
const items = (p) => (p.draft.blocks.find((b) => b.type === "items")?.categories ?? []).flatMap((c) => c.items);
const mk = async (kind, title) => (await (await api("/api/pages", "POST", { title, kind })).json()).id;
const id = await mk("product", "Shop");
const web = (url, confirm = true) => api(`/api/pages/${id}/import/website`, "POST", { url, confirm });

// API boundaries
let r = await web(O + "/shop", false); ok(r.status === 422 && (await r.json()).field === "confirm", "ownership confirmation is required");
for (const [u, why] of [["https://localhost/", "localhost"], ["https://169.254.169.254/latest/meta-data", "cloud metadata address"], ["https://10.0.0.5/", "private network"], ["http://127.0.0.1:54321/rest/v1/pages", "another local service (wrong port)"], ["http://example.com/", "plain http"], ["file:///etc/passwd", "file"]]) { r = await web(u); const j = await r.json(); ok(r.status === 422 && (j.code === "blocked" || j.field === "url"), `refused: ${why} (${r.status})`); }
ok(!hits.some((h) => h.includes("meta-data")), "nothing was requested from the metadata address");
r = await web(O + "/to-internal"); ok(r.status === 422 && (await r.json()).code === "blocked", "redirect to an internal address is refused");
r = await web(O + "/nope"); ok(r.status === 422 && (await r.json()).code === "robots" && !hits.includes("/nope"), "robots.txt disallow respected; the page itself was never requested");
r = await web(O + "/wall"); ok(r.status === 422 && (await r.json()).code === "denied", "403 reported plainly, no workaround");
r = await web(O + "/bomb"); ok(r.status === 422 && (await r.json()).code === "size", "compression bomb stopped");
r = await web(O + "/pdf"); ok(r.status === 422 && (await r.json()).code === "type", "non-page content refused");
r = await web(O + "/plain"); let j = await r.json(); ok(r.status === 200 && j.count === 0 && /doesn’t publish/.test(j.notes.join(" ")), "page with only visible text: honest 'nothing readable' answer");
r = await web(O + "/shop"); j = await r.json(); ok(r.status === 200 && j.count === 4 && j.sheet.rows.length === 5, "structured products read from the fixture page");
ok((await api(`/api/pages/${id}/import/website`, "POST", { url: O + "/shop", confirm: true })).status === 200 && (await pg(id)) && items(await pg(id)).length <= 1, "reading a page changes nothing on the draft");
const free = await mk("product", "Other"); ok((await fetch(BASE + `/api/pages/${free}/import/website`, { method: "POST", headers: { "content-type": "application/json", cookie: cookieHdr, origin: "https://evil.example" }, body: JSON.stringify({ url: O + "/shop", confirm: true }) })).status === 403, "cross-site request blocked");

// browser flow
await page.goto(`${BASE}/workspace/pages/${id}/import`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "A website page" }).click();
ok((await axeRes(page)).length === 0, "website source: no axe violations");
await page.getByLabel("Page address").fill(O + "/shop");
ok(await page.getByRole("button", { name: "Read this page" }).isDisabled(), "button stays disabled until ownership is confirmed");
await page.getByLabel(/I own this website/).check(); await page.getByRole("button", { name: "Read this page" }).click();
await page.getByRole("heading", { name: "Match columns" }).waitFor();
ok(/From website/.test(await page.locator("main").innerText()), "mapping step says the rows came from a website");
await page.getByRole("button", { name: "Review" }).click(); await page.getByRole("heading", { name: "Review" }).waitFor();
const t = await page.locator("main").innerText();
ok(/never converted/.test(t) && /No price was published/.test(t) && /Availability was not published/.test(t), "review flags the USD price, the missing price and missing availability");
await page.screenshot({ path: `${OUT}/review.png`, fullPage: true });
ok((await axeRes(page)).length === 0, "review: no axe violations");
const before = await pg(id);
await page.getByRole("button", { name: /^Import \d+ into draft$/ }).click(); await page.getByRole("heading", { name: "Done" }).waitFor();
const after = await pg(id); const its = items(after);
ok(its.length === 3 && !its.some((i) => i.name === "Dollar bag") && after.published_version === null && after.draft_version === before.draft_version + 1, "3 items imported into the draft; USD row refused; nothing published");
const tote = its.find((i) => i.ref === "TOTE-1"); ok(tote.price === "28000" && tote.link === "https://shop.example.com/p/tote" && tote.description === "Hand-stitched", "price, product link (source URL) and description kept as published");
const myst = its.find((i) => i.ref === "MYST-1"); ok(myst.price === "" && myst.status === "available", "missing price stays empty (not invented); availability defaults and was flagged");
const job = (await ctl()).tables.import_jobs.at(-1); ok(job.source_name === O + "/shop" || job.source_name.startsWith(O) , "import history records the source URL") ; ok(job.counts.source?.type === "website" && job.counts.source.ownershipConfirmed === true, "ownership confirmation recorded with the job");
// a second import of the same page: no duplicates (matched by SKU)
const again = await (await (async () => { const rr = await web(O + "/shop"); const jj = await rr.json(); const csv = jj.sheet.rows.map((x) => x.map((c) => '"' + c.replace(/"/g, '""') + '"').join(",")).join("\r\n"); const fd = new FormData(); fd.set("file", new File([csv], "w.csv")); fd.set("spec", JSON.stringify({ sheet: 0, headerRow: 0, mapping: { ref: 0, category: 1, name: 2, description: 3, price: 4, currency: 5, status: 6, link: 7 }, options: { mode: "both", duplicates: "skip", fields: ["price"] }, edits: [], source: { type: "website", url: O + "/shop", ownershipConfirmed: true }, key: "web-again-0001", expectedVersion: (await pg(id)).draft_version })); return fetch(BASE + `/api/pages/${id}/import/apply`, { method: "POST", headers: { cookie: cookieHdr }, body: fd }); })()).json();
ok(again.counts.added === 0 && items(await pg(id)).length === 3, "re-reading the same page adds nothing new (matched by SKU)");
const noconf = new FormData(); noconf.set("file", new File(["Name\nX\n"], "w.csv")); noconf.set("spec", JSON.stringify({ sheet: 0, headerRow: 0, mapping: { name: 0 }, options: {}, source: { type: "website", url: O + "/shop" }, key: "web-noconf-001", expectedVersion: (await pg(id)).draft_version }));
ok((await fetch(BASE + `/api/pages/${id}/import/apply`, { method: "POST", headers: { cookie: cookieHdr }, body: noconf })).status === 422, "a website import without the ownership confirmation is refused by the server");

// mobile
const M = await open({ width: 390, height: 900, signedIn: true }); const mp = M.page;
await mp.goto(`${BASE}/workspace/pages/${id}/import`, { waitUntil: "networkidle" }); await mp.getByRole("button", { name: "A website page" }).click();
ok((await overflow(mp)) <= 0, "mobile 390: website source has no horizontal overflow"); await mp.screenshot({ path: `${OUT}/mobile.png`, fullPage: true });
ok(logs.filter((l) => !/favicon|Failed to load resource/.test(l)).length === 0, "no console errors " + JSON.stringify(logs.slice(0, 3)));
await browser.close(); await M.browser.close(); srv.close();
console.log(bad ? `${bad} FAILED` : "ALL PASS"); process.exit(bad ? 1 : 0);
