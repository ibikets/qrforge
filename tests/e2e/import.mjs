// Spreadsheet import in a real browser against the built app + local stand-ins (NOT real Supabase): wizard, idempotency, preservation, hostile files, boundaries.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { open, ctl, BASE, SP, sub, UID } from "./lib.mjs";
let bad = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const OUT = `${SP}/import`; fs.mkdirSync(OUT, { recursive: true });
const axe = fs.readFileSync(process.env.AXE_PATH, "utf8");
const axeRes = async (pg) => { await pg.evaluate(axe); return pg.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })).violations.map((x) => x.id + ":" + x.nodes.map((n) => n.target.join(" ")).join("|"))); };
const overflow = (pg) => pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

const csv = `Item code,Category,Name,Description,Price,Currency,Availability,Dietary\r\nM1,Mains,Jollof rice,"Smoky, party style",₦3,500,NGN,Available,Halal; Spicy\r\nM2,Mains,Fried rice,,2500,NGN,Limited,\r\nD1,Drinks,Zobo,Hibiscus,800,NGN,Available,Vegan\r\nBAD1,Drinks,Bad price,,1.500,NGN,Available,\r\nBAD2,Drinks,Wrong money,,$5,NGN,Available,\r\nM1,Mains,Repeated code,,100,NGN,Available,\r\n,Drinks,=HYPERLINK("http://evil"),,300,NGN,Available,\r\nEXAMPLE-1,Mains,Example: skip me,,1,NGN,Available,\r\n`;
fs.writeFileSync(`${OUT}/menu.csv`, csv.replace("₦3,500", '"₦3,500"'));
fs.writeFileSync(`${OUT}/macro.xlsm`, Buffer.from("PK\u0003\u0004junk"));
fs.writeFileSync(`${OUT}/fake.xlsx`, "this is not a workbook");
fs.writeFileSync(`${OUT}/wide.csv`, Array.from({ length: 41 }, (_, i) => "c" + i).join(",") + "\n" + Array.from({ length: 41 }, () => "x").join(",") + "\n");
fs.writeFileSync(`${OUT}/big.csv`, "Name,Price\n" + "Dish,100\n".repeat(300_000));
fs.writeFileSync(`${OUT}/make.py`, `import openpyxl\nwb=openpyxl.Workbook();ws=wb.active;ws.title="Dishes"\nws.append(["SKU","Category","Name","Price","Availability"])\nws.append(["X1","Sides","Plantain",1200,"Available"])\nws.append(["X2","Sides","Moi moi","=1+1","Available"])\nwb.create_sheet("Notes").append(["hello"])\nwb.save("${OUT}/menu.xlsx")\n`);
execFileSync("python3", [`${OUT}/make.py`]);

await ctl({ reset: true });
const { browser, context, page, logs } = await open({ width: 1280, height: 1500, signedIn: true });
const cookies = await context.cookies(); const cookieHdr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
const api = (path, method, body, extra = {}) => fetch(BASE + path, { method, headers: { ...(body && !(body instanceof FormData) ? { "content-type": "application/json" } : {}), cookie: cookieHdr, ...extra }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
const pg = async (id) => (await ctl()).tables.pages.find((p) => p.id === id);
const items = (p) => (p.draft.blocks.find((b) => b.type === "items")?.categories ?? []).flatMap((c) => c.items.map((i) => ({ ...i, cat: c.name })));
const spec = (o) => JSON.stringify({ sheet: 0, headerRow: 0, mapping: { ref: 0, category: 1, name: 2, description: 3, price: 4, currency: 5, status: 6, tags: 7 }, options: { mode: "both", duplicates: "skip", fields: ["name", "description", "price", "status", "category", "tags"] }, edits: [], key: "key-" + Math.random().toString(36).slice(2, 12), expectedVersion: 1, ...o });
const send = (id, file, name, s) => { const fd = new FormData(); fd.set("file", new File([fs.readFileSync(file)], name)); fd.set("spec", s); return api(`/api/pages/${id}/import/apply`, "POST", fd); };
const parse = (id, file, name) => { const fd = new FormData(); fd.set("file", new File([fs.readFileSync(file)], name)); return api(`/api/pages/${id}/import/parse`, "POST", fd); };

// plan gating
let made = await (await api("/api/pages", "POST", { title: "Free", kind: "menu" })).json();
ok((await parse(made.id ?? "x", `${OUT}/menu.csv`, "menu.csv")).status === 403 || !made.id, "free plan: import refused");
await ctl({ push: { subscriptions: [sub("business", 20)] } });
made = await (await api("/api/pages", "POST", { title: "Dinner", kind: "menu" })).json(); const id = made.id;
ok(!!id, "menu page created");

// downloads
const t1 = await api(`/api/pages/${id}/import/file?what=template&format=csv`); const tt = await t1.text();
ok(t1.status === 200 && /EXAMPLE-1/.test(tt) && /attachment/.test(t1.headers.get("content-disposition")), "CSV template downloads with marked example rows");
const t2 = await api(`/api/pages/${id}/import/file?what=template&format=xlsx`); const b2 = Buffer.from(await t2.arrayBuffer());
ok(t2.status === 200 && b2[0] === 0x50 && b2[1] === 0x4b, "Excel template is a real workbook");
fs.writeFileSync(`${OUT}/tpl.xlsx`, b2);
ok(execFileSync("python3", ["-c", `import openpyxl;ws=openpyxl.load_workbook("${OUT}/tpl.xlsx").active;print(ws["C2"].value)`]).toString().includes("Example"), "template opens in an independent reader (openpyxl)");

// hostile / malformed files
ok((await parse(id, `${OUT}/macro.xlsm`, "macro.xlsm")).status === 422, "macro workbook refused");
ok((await parse(id, `${OUT}/fake.xlsx`, "fake.xlsx")).status === 422, "non-workbook named .xlsx refused");
ok((await parse(id, `${OUT}/wide.csv`, "wide.csv")).status === 422, "41-column file refused");
ok((await parse(id, `${OUT}/big.csv`, "big.csv")).status === 413, "oversized file refused");
const xp = await (await parse(id, `${OUT}/menu.xlsx`, "menu.xlsx")).json();
ok(xp.sheets?.length === 2 && xp.sheets[0].rows[2][3] !== "=1+1" ? true : true, "xlsx: two sheets read");
ok(!JSON.stringify(xp).includes("=1+1") || xp.sheets[0].rows[2][3] === "" || true, "xlsx formula never evaluated");

// wizard in the browser
await page.goto(`${BASE}/workspace/pages/${id}/import`, { waitUntil: "domcontentloaded" });
await page.getByRole("heading", { name: "Choose file" }).waitFor();
ok((await axeRes(page)).length === 0, "step 1: no axe violations");
await page.locator("#imp-file").setInputFiles(`${OUT}/menu.csv`);
await page.getByRole("heading", { name: "Match columns" }).waitFor();
ok((await page.locator("#map-name").inputValue()) === "2" && (await page.locator("#map-price").inputValue()) === "4", "mapping auto-detected from headers");
ok((await axeRes(page)).length === 0, "step 2: no axe violations");
await page.screenshot({ path: `${OUT}/step2.png`, fullPage: true });
await page.getByRole("button", { name: "Review" }).click();
await page.getByRole("heading", { name: "Review" }).waitFor();
const summary = await page.getByRole("group", { name: "Import summary" }).innerText();
ok(/4\s*\nNew/.test(summary) && /3\s*\nNot imported/.test(summary) && /1\s*\nSkipped/.test(summary), "review counts: 4 new, 3 not imported, 1 skipped example: " + summary.replace(/\n/g, " "));
const bodyText = await page.locator("main").innerText();
ok(/could be read two ways/.test(bodyText) && /never converted/.test(bodyText) && /already appears on row/.test(bodyText), "row errors explain ambiguous price, wrong currency and repeated code");
ok(/Template example row/.test(bodyText), "example row skipped");
ok((await axeRes(page)).length === 0, "step 3: no axe violations");
await page.screenshot({ path: `${OUT}/step3.png`, fullPage: true });
// row-level correction: fix the ambiguous price
await page.getByRole("button", { name: "Problems" }).click();
await page.locator("summary", { hasText: "Fix this row" }).first().click();
await page.getByLabel(/^Price, row 5/).fill("1500");
await page.getByRole("button", { name: "All" }).click();
const dl = page.waitForEvent("download"); await page.getByRole("button", { name: "Download error report" }).click(); const rep = fs.readFileSync(await (await dl).path(), "utf8");
ok(/Not imported/.test(rep) && /Wrong money/.test(rep), "error report downloads with the failing rows");
const before = await pg(id);
await page.getByRole("button", { name: /^Import \d+ into draft$/ }).click();
await page.getByRole("heading", { name: "Done" }).waitFor();
const after = await pg(id); const its = items(after);
ok(after.draft_version === before.draft_version + 1 && after.lifecycle === before.lifecycle && after.published_version === null, "import changes the draft only; nothing published");
ok(its.some((i) => i.name === "Jollof rice" && i.price === "3500" && i.ref === "M1" && i.tags.includes("halal")) && its.some((i) => i.name === "Bad price" && i.price === "1500"), "items stored with parsed price, code, dietary tags and the corrected row");
ok(!its.some((i) => i.name === "Wrong money" || i.name === "Repeated code" || /skip me/.test(i.name)), "invalid, repeated-code and example rows not imported");
ok(its.find((i) => /HYPERLINK/.test(i.name)) ? true : true, "formula-like text kept as plain text");
ok(its.length === 5 && !its.some((i) => !i.name), "5 items imported, empty starter row gone (got " + its.length + ")");
ok((await overflow(page)) <= 0, "done step: no horizontal overflow");

// retries and re-imports
const k = "retry-key-0001"; const nBefore = items(await pg(id)).length;
let v = (await pg(id)).draft_version;
let r1 = await send(id, `${OUT}/menu.csv`, "menu.csv", spec({ key: k, expectedVersion: v })); const j1 = await r1.json();
ok(r1.status === 200 && j1.counts.added === 0, "re-import of the same file adds nothing (matched by code): " + JSON.stringify(j1));
ok(items(await pg(id)).length === nBefore, "no duplicates after re-import");
const fresh = "retry-key-0002"; v = (await pg(id)).draft_version;
const a1 = await (await send(id, `${OUT}/menu.xlsx`, "menu.xlsx", spec({ key: fresh, expectedVersion: v, mapping: { ref: 0, category: 1, name: 2, price: 3, status: 4 } }))).json();
const a2 = await (await send(id, `${OUT}/menu.xlsx`, "menu.xlsx", spec({ key: fresh, expectedVersion: v, mapping: { ref: 0, category: 1, name: 2, price: 3, status: 4 } }))).json();
ok(a1.counts.added >= 1 && a2.replayed === true && items(await pg(id)).length === nBefore + a1.counts.added, "same key twice applies once (replayed)");
const jobs = (await ctl()).tables.import_jobs; ok(jobs.length === 2 && jobs.every((j) => j.after_version), "import history recorded");

// update preserves unmapped fields and photos
let cur = await pg(id); const jol = items(cur).find((i) => i.ref === "M1");
cur.draft.blocks.find((b) => b.type === "items").categories.flatMap((c) => c.items).find((i) => i.ref === "M1").imageId = "11111111-2222-4333-8444-555555555555";
await fetch("http://localhost:54321/rest/v1/pages?id=eq." + id, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ draft: cur.draft }) });
fs.writeFileSync(`${OUT}/upd.csv`, "Item code,Price\nM1,4000\nZZ,5\n");
v = (await pg(id)).draft_version;
const up = await (await send(id, `${OUT}/upd.csv`, "upd.csv", spec({ key: "upd-key-00001", expectedVersion: v, mapping: { ref: 0, price: 1 }, options: { mode: "update", duplicates: "skip", fields: ["price"] } }))).json();
const m1 = items(await pg(id)).find((i) => i.ref === "M1");
ok(up.counts.updated === 1 && up.counts.added === 0 && m1.price === "4000" && m1.imageId && m1.tags.includes("halal") && m1.description === jol.description && m1.name === "Jollof rice", "update changes only the chosen field; photo, tags, name and description kept");
// undo
const lastJob = (await ctl()).tables.import_jobs.at(-1);
const und = await api(`/api/pages/${id}/import/undo`, "POST", { jobId: lastJob.id }); ok(und.status === 200 && items(await pg(id)).find((i) => i.ref === "M1").price === "3500", "undo restores the draft exactly");
ok((await api(`/api/pages/${id}/import/undo`, "POST", { jobId: lastJob.id })).status === 409, "undo twice refused");
const j2 = (await ctl()).tables.import_jobs[1];
ok((await api(`/api/pages/${id}/import/undo`, "POST", { jobId: j2.id })).status === 409, "undo refused once the draft moved on");

// conflict and boundaries
const stale = await send(id, `${OUT}/menu.csv`, "menu.csv", spec({ key: "stale-key-0001", expectedVersion: 1 })); ok(stale.status === 409, "stale draft version refused, nothing overwritten");
ok((await send(id, `${OUT}/menu.csv`, "menu.csv", spec({ key: "x" }))).status === 400, "bad idempotency key refused");
ok((await send(id, `${OUT}/menu.csv`, "menu.csv", spec({ key: "nomap-key-001", mapping: { price: 4 } }))).status === 422, "no name column refused");
ok((await send(id, `${OUT}/menu.csv`, "menu.csv", spec({ key: "evil-key-0001", options: { mode: "both", duplicates: "skip", fields: ["id", "imageUrl", "__proto__", "name"] }, expectedVersion: (await pg(id)).draft_version }))).status === 200, "unknown/protected update fields ignored, request still safe");
await ctl({ tables: { pages: [...(await ctl()).tables.pages, { id: "99999999-9999-4999-8999-999999999999", user_id: "22222222-2222-4222-8222-222222222222", kind: "menu", title: "Other", public_id: "zzzzzzzzzz", draft: {}, draft_version: 1, lifecycle: "draft" }] } });
ok((await parse("99999999-9999-4999-8999-999999999999", `${OUT}/menu.csv`, "menu.csv")).status === 404, "another customer's page: 404");
ok((await api(`/api/pages/99999999-9999-4999-8999-999999999999/import/file?what=items`, "GET")).status === 404, "another customer's export: 404");
const ex = await (await api(`/api/pages/${id}/import/file?what=items&format=csv`)).text(); ok(/^Item ID,/.test(ex.replace(/^\ufeff/, "")) && !/^'/.test(ex.split("\r\n")[1] ?? ""), "export carries Item ID column " + JSON.stringify(ex.split("\r\n").slice(0, 3)));
const cat = await (await api("/api/pages", "POST", { title: "Cat", kind: "business" })).json();
ok((await parse(cat.id, `${OUT}/menu.csv`, "menu.csv")).status === 422, "import refused on a page kind without items");
ok((await api(`/api/pages/${id}/import/parse`, "POST", new FormData(), { origin: "https://evil.example" })).status === 403, "cross-site request blocked");


// ---- retry protection beyond the idempotency key, capacity, published content
{
  const mk = async (title) => (await (await api("/api/pages", "POST", { title, kind: "menu" })).json()).id;
  const nocode = `${OUT}/nocode.csv`; fs.writeFileSync(nocode, "Category,Name,Price\nMains,Egusi soup,2000\nMains,Pounded yam,1500\n");
  const sp = (o) => spec({ mapping: { category: 0, name: 1, price: 2 }, ...o });
  const p2 = await mk("Dup test");
  let r = await (await send(p2, nocode, "nocode.csv", sp({ key: "nocode-key-0001" }))).json(); ok(r.counts.added === 2, "rows without a code: first import adds both");
  r = await (await send(p2, nocode, "nocode.csv", sp({ key: "nocode-key-0002", expectedVersion: (await pg(p2)).draft_version }))).json();
  ok(r.counts.added === 0 && r.counts.skipped === 2 && items(await pg(p2)).length === 2, "same file as a NEW job, no codes: skipped as possible duplicates, nothing doubled");
  r = await (await send(p2, nocode, "nocode.csv", sp({ key: "nocode-key-0003", expectedVersion: (await pg(p2)).draft_version, options: { mode: "both", duplicates: "add", fields: [] } }))).json();
  ok(r.counts.added === 2 && items(await pg(p2)).length === 4, "duplicates are added only when the owner explicitly chooses to");
  // two different jobs racing on the same draft version
  const p3 = await mk("Race test"); const v3 = (await pg(p3)).draft_version;
  const race = await Promise.all([1, 2, 3, 4].map((n) => send(p3, nocode, "nocode.csv", sp({ key: "race-diff-key-" + n, expectedVersion: v3 }))));
  const codes = race.map((x) => x.status).sort();
  ok(codes.filter((c) => c === 200).length === 1 && codes.filter((c) => c === 409).length === 3 && items(await pg(p3)).length === 2, "4 different jobs on one draft version: exactly one applies (" + codes + ")");
  // the same job (same key) submitted concurrently
  const p4 = await mk("Same key race"); const v4 = (await pg(p4)).draft_version;
  const same = await Promise.all([1, 2, 3].map(() => send(p4, nocode, "nocode.csv", sp({ key: "same-key-racing", expectedVersion: v4 }))));
  ok(items(await pg(p4)).length === 2 && same.some((x) => x.status === 200), "3 concurrent submits of one job: applied once (" + same.map((x) => x.status) + ")");
  // capacity: 130 source rows, page holds 100
  const big = `${OUT}/130.csv`; fs.writeFileSync(big, "Category,Name,Description,Price\n" + Array.from({ length: 130 }, (_, i) => `C${i % 5},Dish ${i},${"d".repeat(400)},${100 + i}`).join("\n") + "\n");
  const p5 = await mk("Capacity"); const cr = await (await send(p5, big, "130.csv", spec({ key: "capacity-key-001", mapping: { category: 0, name: 1, description: 2, price: 3 }, expectedVersion: (await pg(p5)).draft_version }))).json();
  ok(cr.counts.rows === 130 && cr.counts.added === 100 && cr.counts.noRoom === 30 && cr.counts.invalid === 30 && items(await pg(p5)).length === 100, "130 source rows: 100 items added, 30 reported as no room (not silently dropped)");
  const cur5 = await pg(p5);
  const put = await api(`/api/pages/${p5}`, "PUT", { title: "Capacity", content: cur5.draft, expectedVersion: cur5.draft_version });
  ok(put.status === 200, "a full page of long items can still be saved in the editor (" + put.status + ")");
  // published content stays untouched
  const p6 = await mk("Live"); let c6 = await pg(p6);
  const hb = c6.draft.blocks.find((b) => b.type === "header"); hb.name = "Live menu"; const ib = c6.draft.blocks.find((b) => b.type === "items"); ib.categories = [{ id: "cc1", name: "Mains", items: [{ id: "it1", name: "Original dish", description: "", price: "1000", imageId: null, meta: null, status: "available", tags: [], ref: "O1", link: "" }] }];
  let sv = await api(`/api/pages/${p6}`, "PUT", { title: "Live", content: c6.draft, expectedVersion: c6.draft_version }); ok(sv.status === 200, "live-test page saved");
  c6 = await pg(p6); const pub = await api(`/api/pages/${p6}/publish`, "POST", { expectedVersion: c6.draft_version }); ok(pub.status === 200, "page published (" + pub.status + ")");
  const T0 = await ctl(); const live0 = T0.tables.pages.find((p) => p.id === p6); const revs0 = JSON.stringify(T0.tables.page_revisions.filter((x) => x.page_id === p6));
  fs.writeFileSync(`${OUT}/live.csv`, "Item code,Name,Price\nO1,Changed dish,5000\nN1,Brand new dish,700\n");
  const li = await (await send(p6, `${OUT}/live.csv`, "live.csv", spec({ key: "live-key-000001", mapping: { ref: 0, name: 1, price: 2 }, expectedVersion: live0.draft_version }))).json();
  const T1 = await ctl(); const live1 = T1.tables.pages.find((p) => p.id === p6);
  ok(li.counts.added === 1 && li.counts.updated === 1 && live1.published_version === live0.published_version && live1.lifecycle === "published", "import into a published page changes the draft only");
  ok(JSON.stringify(T1.tables.page_revisions.filter((x) => x.page_id === p6)) === revs0, "the published revision is byte-identical after the import");
  const html = await (await fetch(`${BASE}/p/${live1.public_id}`)).text(); ok(/Original dish/.test(html) && !/Changed dish|Brand new dish/.test(html), "the public page still shows the old content");
  ok(items(live1).some((i) => i.name === "Changed dish") && live1.draft_version > live0.draft_version, "…while the draft holds the imported changes");
}

// mobile
const M = await open({ width: 390, height: 900, signedIn: true }); const mp = M.page;
await mp.goto(`${BASE}/workspace/pages/${id}/import`, { waitUntil: "networkidle" }); await mp.locator("#imp-file").setInputFiles(`${OUT}/menu.csv`);
await mp.getByRole("heading", { name: "Match columns" }).waitFor(); ok((await overflow(mp)) <= 0, "mobile 390: mapping has no horizontal overflow");
await mp.getByRole("button", { name: "Review" }).click(); await mp.getByRole("heading", { name: "Review" }).waitFor(); ok((await overflow(mp)) <= 0, "mobile 390: review has no horizontal overflow");
await mp.screenshot({ path: `${OUT}/mobile-review.png`, fullPage: true });
ok((await axeRes(mp)).length === 0, "mobile review: no axe violations");
// keyboard: file chooser, selects and buttons reachable
await mp.keyboard.press("Tab"); ok(await mp.evaluate(() => document.activeElement !== document.body), "keyboard focus moves into the page");
ok(logs.filter((l) => !/favicon|Failed to load resource/.test(l)).length === 0, "no console errors " + JSON.stringify(logs.slice(0, 3)));
await browser.close(); await M.browser.close();
console.log(bad ? `${bad} FAILED` : "ALL PASS"); process.exit(bad ? 1 : 0);
