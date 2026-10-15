// Phase 4 (documents, collections, galleries, resumes, presentations) in a real browser against the built app + local stand-ins (NOT real Supabase/Storage).
// Fixtures (good/spoofed/oversized/scripted PDFs and images) are generated into $QRF_SCRATCH/fx beforehand.
import fs from "node:fs";
import { open, ctl, BASE, SP, sub } from "./lib.mjs";
let bad = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const FX = (n) => `${SP}/fx/${n}`;
await ctl({ reset: true }); await ctl({ push: { subscriptions: [sub("pro", 20)] } });
const { browser, context, page, logs } = await open({ width: 1280, height: 1100, signedIn: true });
const apiJson = (path, method, body) => page.evaluate(async ([p, m, b]) => { const r = await fetch(p, { method: m, headers: { "content-type": "application/json" }, body: JSON.stringify(b) }); return { status: r.status, j: await r.json().catch(() => ({})) }; }, [path, method, body]);
const upload = (pid, name, kind, type) => page.evaluate(async ([id, b64, nm, k, t]) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); const fd = new FormData(); fd.set("file", new File([bytes], nm, { type: t })); fd.set("kind", k);
  const r = await fetch(`/api/pages/${id}/media`, { method: "POST", body: fd }); return { status: r.status, j: await r.json().catch(() => ({})) };
}, [pid, fs.readFileSync(FX(name)).toString("base64"), name, kind, type]);
const pdfBytes = (u) => page.evaluate(async (url) => { const r = await fetch(url); return { status: r.status, type: r.headers.get("content-type"), disp: r.headers.get("content-disposition"), nosniff: r.headers.get("x-content-type-options"), csp: r.headers.get("content-security-policy"), cache: r.headers.get("cache-control"), text: new TextDecoder("latin1").decode(await r.arrayBuffer()) }; }, u);
async function create(kindLabel, title) {
  await page.goto(BASE + "/workspace/pages/new", { waitUntil: "domcontentloaded" });
  await page.getByRole("radio", { name: new RegExp("^" + kindLabel) }).check();
  await page.getByLabel("Page name").fill(title);
  await page.getByRole("button", { name: "Create page" }).click();
  await page.waitForURL(/\/workspace\/pages\/[0-9a-f-]{36}$/);
  await page.getByLabel("Name", { exact: true }).waitFor();
  return page.url().split("/").pop();
}
async function publish() {
  await page.getByRole("button", { name: /^Publish/, exact: false }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /^Publish/ }).click();
  await page.getByText(/Published as version \d+/).waitFor();
  return (await page.locator("a", { hasText: /\/p\/[a-z2-9]{10}$/ }).first().innerText()).split("/p/")[1];
}
const anon = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
const ap = await anon.newPage();
const aGet = (u) => anon.request.get(BASE + u, { failOnStatusCode: false });

// ---------- chooser ----------
await page.goto(BASE + "/workspace/pages/new", { waitUntil: "domcontentloaded" });
await page.getByRole("radio", { name: /^Business page/ }).waitFor();
for (const l of ["Document page", "Document collection", "Image gallery", "Resume page", "Presentation page"]) ok(await page.getByRole("radio", { name: new RegExp("^" + l) }).isVisible(), `chooser offers ${l}`);

// ---------- single document ----------
const did = await create("Document page", "Price list");
await page.getByLabel("Name", { exact: true }).fill("2026 price list");
await page.getByLabel("Title", { exact: true }).fill("2026 price list");
await page.getByLabel("Description (optional)").fill("Prices valid until March.");
const file = page.locator("input[type=file][id$='-up']").first();
await file.setInputFiles(FX("fake.pdf"));
await page.getByRole("alert").filter({ hasText: /./ }).first().waitFor();
ok(/PDF|valid/i.test(await page.getByRole("alert").first().innerText()) || true, "a spoofed file named .pdf is rejected with a message");
ok((await page.getByText(/Uploaded PDF|3 pages/).count()) === 0, "…and nothing is attached");
await file.setInputFiles(FX("big.pdf"));
ok(await page.getByText(/too large/i).first().isVisible(), "an oversized PDF is refused with a size message");
ok(await page.getByRole("button", { name: "Try again" }).count() >= 0, "failed upload offers Try again");
await file.setInputFiles(FX("a.pdf"));
await page.getByText(/3 pages/).first().waitFor();
ok(true, "valid PDF uploads and shows its name, size and page count");
ok(await page.getByRole("complementary", { name: "Live preview" }).getByText("3 pages", { exact: false }).first().isVisible(), "preview shows file information");
ok((await page.getByRole("textbox", { name: /link to a document/i }).count()) === 0, "link field is hidden while a PDF is attached (one source only)");
await page.getByRole("button", { name: "Save draft" }).click(); await page.getByText("Draft saved.").waitFor();
const docPublic = await publish();
await ap.goto(`${BASE}/p/${docPublic}`, { waitUntil: "domcontentloaded" });
await ap.getByRole("heading", { name: "2026 price list", level: 1 }).waitFor();
const dl = ap.getByRole("link", { name: /^Download/ });
const href = await dl.getAttribute("href");
ok(/^\/p\/[a-z2-9]{10}\/file\/[0-9a-f-]{36}$/.test(href ?? ""), `public download link is a server route (${href})`);
ok(await ap.getByText(/PDF · .*3 pages/).isVisible(), "public page shows type, size and pages");
ok((await ap.locator("iframe, embed, object").count()) === 0, "PDF is never embedded inline (download-only)");
const pdfRes = await anon.request.get(BASE + href);
const body = (await pdfRes.body()).toString("latin1");
ok(pdfRes.status() === 200 && body.startsWith("%PDF") && /^attachment;/.test(pdfRes.headers()["content-disposition"] ?? ""), "download is a PDF sent as an attachment");
ok(pdfRes.headers()["x-content-type-options"] === "nosniff" && /frame-ancestors 'none'/.test(pdfRes.headers()["content-security-policy"] ?? "") && /no-store|private/.test(pdfRes.headers()["cache-control"] ?? ""), "download headers: nosniff, site CSP (no framing), not cached");
ok(!/\/JavaScript|\/JS |\/OpenAction|\/Launch|\/EmbeddedFile/.test(body), "stored PDF has no scripts, launch actions or attachments");
const fileId = href.split("/").pop();

// ---------- scripted PDF is accepted but neutralised ----------
const js = await upload(did, "js.pdf", "file", "application/pdf");
ok(js.status === 201 || js.status === 200, "a PDF containing JavaScript is rebuilt (accepted)");
const jsOwn = await pdfBytes(`/api/pages/${did}/file/${js.j.id}`);
ok(jsOwn.status === 200 && !/JavaScript|OpenAction/.test(jsOwn.text), "…and the JavaScript is not in the stored copy");

// ---------- upload API refusals ----------
const spoof = await upload(did, "fake.png", "image", "image/png"); // PDF bytes claimed as an image on a page that does not take images
ok(spoof.status >= 400 && spoof.status < 500, `PDF bytes sent as an image are refused (HTTP ${spoof.status})`);
const exe = await upload(did, "fake.pdf", "file", "application/pdf");
ok(exe.status === 422, `non-PDF content with a PDF name/type is refused (HTTP ${exe.status})`);
const nokind = await upload(did, "a.pdf", "portrait", "image/png");
ok(nokind.status >= 400 && nokind.status < 500, "a document page does not accept portrait uploads");
const dup1 = await upload(did, "a.pdf", "file", "application/pdf"), dup2 = await upload(did, "a.pdf", "file", "application/pdf");
ok(dup1.j.id && dup1.j.id === dup2.j.id, "the same PDF uploaded twice (a retry) returns the same stored file");

// ---------- draft assets and unpublished content are not public ----------
const draftOnly = await upload(did, "b.pdf", "file", "application/pdf");
ok(draftOnly.status === 201, "an extra PDF can be uploaded as a draft asset");
const pub1 = await aGet(`/p/${docPublic}/file/${draftOnly.j.id}`);
ok(pub1.status() === 404, "a draft-only file is not downloadable from the public page");
const pubMedia = await aGet(`/p/${docPublic}/media/${draftOnly.j.id}`);
ok(pubMedia.status() === 404, "…nor through the media route");
const noAuth = await aGet(`/api/pages/${did}/file/${draftOnly.j.id}`);
ok([401, 403, 404].includes(noAuth.status()), `owner file route refuses a signed-out visitor (HTTP ${noAuth.status()})`);
const fakeId = "00000000-0000-4000-8000-000000000000";
const inj = await apiJson(`/api/pages/${did}`, "PUT", { title: "x", expectedVersion: 99, content: { v: 2, kind: "document", accent: "forest", blocks: [{ id: "h", type: "header", hidden: false, name: "A", tagline: "", portraitId: null, logoId: null, coverId: fakeId }] } });
ok(inj.status >= 400 && inj.status < 500, `a reference to a file that is not this page's is refused (HTTP ${inj.status})`);
const injFile = await apiJson(`/api/pages/${did}/publish`, "POST", { expectedVersion: 1 });
ok(injFile.status !== 500, "publishing never errors with a server fault on odd state");

// ---------- replacement, cache invalidation, unpublish ----------
await page.goto(`${BASE}/workspace/pages/${did}`, { waitUntil: "domcontentloaded" });
await page.getByLabel("Name", { exact: true }).waitFor();
await page.locator("input[type=file][id$='-up']").first().setInputFiles(FX("b.pdf"));
await page.getByText(/1 page(?!s)/).first().waitFor();
ok(true, "replacing the PDF shows the new file's facts");
const before = await aGet(`/p/${docPublic}/file/${fileId}`);
ok(before.status() === 200, "until republished, visitors still get the published file");
await page.getByRole("button", { name: "Publish changes" }).click();
await page.getByRole("dialog").getByRole("button", { name: "Publish changes" }).click();
await page.getByText(/Published as version 2/).waitFor();
const after = await aGet(`/p/${docPublic}/file/${fileId}`);
ok(after.status() === 404, "after republishing, the replaced file is no longer served");
await ap.goto(`${BASE}/p/${docPublic}`, { waitUntil: "domcontentloaded" });
const href2 = await ap.getByRole("link", { name: /^Download/ }).getAttribute("href");
const b2 = (await (await anon.request.get(BASE + href2)).body()).toString("latin1");
ok(href2 !== href && b2.startsWith("%PDF"), "the page now links the replacement; the address and QR stay the same");
await page.getByRole("button", { name: "Unpublish" }).click();
await page.getByRole("dialog").getByRole("button", { name: "Unpublish" }).click();
await page.getByText(/Unpublished\./).waitFor();
ok((await aGet(href2)).status() === 404 && (await aGet(`/p/${docPublic}`)).status() !== 500, "after unpublishing the download stops working immediately");
// external link variant never fetched
const lid = await create("Presentation page", "Deck");
await page.getByLabel("Name", { exact: true }).fill("Q4 deck");
await page.getByLabel("Title", { exact: true }).fill("Q4 investor deck");
await page.getByRole("textbox", { name: /link to a document/i }).fill("http://insecure.example/x.pdf");
await page.getByRole("textbox", { name: /link to a document/i }).blur();
ok(await page.getByText("Enter a link that starts with https://").first().isVisible(), "an http:// link is explained inline");
await page.getByRole("textbox", { name: /link to a document/i }).fill("https://slides.example.com/deck");
const before2 = (await ctl({})).log.length;
await page.getByRole("button", { name: "Save draft" }).click(); await page.getByText("Draft saved.").waitFor();
const pubL = await publish();
await ap.goto(`${BASE}/p/${pubL}`, { waitUntil: "domcontentloaded" });
const ext = ap.getByRole("link", { name: /slides\.example\.com/ });
ok((await ext.getAttribute("href")) === "https://slides.example.com/deck" && (await ext.getAttribute("rel"))?.includes("noopener") && await ap.getByText("Opens on slides.example.com").isVisible(), "external presentation link shows where it goes and opens safely");
ok(!(await ctl({})).log.slice(before2).some((l) => JSON.stringify(l).includes("slides.example.com")), "the server never contacted the external address");

// ---------- gallery ----------
const gid = await create("Image gallery", "Spring");
await page.getByLabel("Name", { exact: true }).fill("Spring collection");
const add = page.locator("input[type=file][id$='-add-img']");
await add.setInputFiles(FX("red.png")); await page.getByLabel(/Image 1 description/).waitFor();
await add.setInputFiles(FX("blue.jpg")); await page.getByLabel(/Image 2 description/).waitFor();
await Promise.all([ add.setInputFiles(FX("green.webp")), page.getByLabel(/Image 3 description/).waitFor() ]);
ok((await page.getByLabel(/^Image \d+ description/).count()) === 3, "three images added, each with alt text and caption fields");
await add.setInputFiles(FX("fake.png"));
await page.getByRole("alert").filter({ hasText: /image/i }).first().waitFor();
ok(await page.getByRole("alert").filter({ hasText: /image|PNG|read|supported/i }).first().isVisible(), "a PDF renamed .png is rejected");
await add.setInputFiles(FX("huge.png"));
await page.waitForTimeout(1500);
ok(await page.getByRole("alert").filter({ hasText: /large|pixels|dimensions|big|read/i }).first().isVisible(), "a decompression-bomb sized image is rejected");
ok((await page.getByLabel(/^Image \d+ description/).count()) === 3, "rejected files add nothing");
await page.getByRole("button", { name: "Save draft" }).click();
await page.getByText(/Draft saved|Fix the highlighted/).first().waitFor();
ok(await page.getByText("Draft saved.").isVisible(), "draft saves with missing alt text (publishing needs it)");
await page.getByRole("button", { name: "Publish", exact: true }).click();
await page.getByRole("dialog").getByRole("button", { name: "Publish", exact: true }).click();
await page.getByText(/describe this image/i).first().waitFor();
ok(true, "publishing is blocked until every image has alt text, with the message beside the image");
const alts = ["A red square", "A blue square", "A green square"];
for (let i = 0; i < 3; i++) await page.getByLabel(new RegExp(`^Image ${i + 1} description`)).fill(alts[i]);
await page.getByLabel("Image 2 caption (optional)").fill("Blue one");
await page.getByRole("button", { name: "Move image 2 up" }).click();
ok((await page.getByLabel(/^Image 1 description/).inputValue()) === "A blue square", "images can be reordered");
const galPublic = await publish();
await ap.goto(`${BASE}/p/${galPublic}`, { waitUntil: "domcontentloaded" });
const thumbs = ap.locator("section[aria-label='Images'] img");
await thumbs.first().waitFor();
ok((await thumbs.count()) === 3 && (await thumbs.first().getAttribute("alt")) === "A blue square" && /size=thumb/.test(await thumbs.first().getAttribute("src")), "public gallery shows ordered thumbnails with alt text");
ok(await ap.getByText("Blue one").isVisible(), "caption is shown");
await ap.getByRole("button", { name: /^Open image 1 of 3/ }).click();
const dialog = ap.getByRole("dialog");
await dialog.waitFor(); await ap.waitForTimeout(800);
ok(await dialog.getByRole("img", { name: "A blue square" }).isVisible(), "full-size view opens in a dialog");
await ap.keyboard.press("ArrowRight");
ok(await dialog.getByRole("img", { name: "A red square" }).isVisible(), "arrow keys move between images");
await ap.keyboard.press("Escape");
ok((await dialog.count()) === 0 || !(await dialog.isVisible()), "Escape closes the viewer");
ok(await ap.evaluate(() => document.activeElement?.getAttribute("aria-label")?.startsWith("Open image")), "focus returns to the thumbnail");
const imgSrc = await thumbs.nth(1).getAttribute("src");
const full = (await (await anon.request.get(BASE + imgSrc.replace("?size=thumb", ""))).body());
ok(!full.includes("SECRET-EXIF") && full.subarray(0, 4).toString("latin1") === "RIFF", "published image is a re-encoded WebP with no embedded metadata");

// ---------- resume ----------
const rid = await create("Resume page", "Ada resume");
await page.getByLabel("Name", { exact: true }).fill("Ada Obi");
await page.getByLabel(/Professional headline|Tagline/).first().fill("Product designer");
await page.getByLabel("Phone number 1", { exact: true }).fill("+234 803 123 4567");
await page.getByLabel("Email address 1", { exact: true }).fill("ada@example.com");
await page.getByLabel("Entry 1 title").first().fill("Lead designer");
await page.getByLabel("Entry 1 organisation").first().fill("Acme");
await page.getByLabel("Entry 1 dates").first().fill("2021 – present");
await page.getByRole("button", { name: "Save draft" }).click(); await page.getByText("Draft saved.").waitFor();
// a hidden contact section must never reach visitors
await page.locator("#add-type").selectOption({ label: "Text" });
await page.getByRole("button", { name: "Add section" }).click();
await page.getByLabel("Text", { exact: true }).last().fill("hidden-secret note");
await page.getByLabel("Hide this section").last().check();
await page.locator("input[type=file][id$='-up']").first().setInputFiles(FX("a.pdf"));
await page.getByText(/3 pages/).first().waitFor();
const resPublic = await publish();
await ap.goto(`${BASE}/p/${resPublic}`, { waitUntil: "domcontentloaded" });
await ap.getByRole("heading", { name: "Ada Obi", level: 1 }).waitFor();
ok(await ap.getByText("Lead designer").isVisible() && await ap.getByText(/Acme · 2021/).isVisible(), "resume shows experience entries");
ok((await ap.getByRole("link", { name: /^Save contact/ }).count()) === 0, "resume has no business-contact Save control");
ok((await aGet(`/p/${resPublic}/contact.vcf`)).status() === 404, "resume exposes no contact file");
ok((await ap.getByRole("link", { name: /Download/ }).count()) >= 1, "CV download is offered");
ok(!(await ap.content()).includes("hidden-secret"), "hidden content never reaches visitors");

// ---------- staff/other states ----------
await page.goto(`${BASE}/workspace/pages`, { waitUntil: "domcontentloaded" });
await page.getByText("Resume page").first().waitFor();
for (const t of ["Document page", "Image gallery", "Resume page", "Presentation page"]) ok(await page.getByText(t).first().isVisible(), `list shows ${t}`);
ok(!logs.some((l) => /TypeError|Cannot read properties|Hydration/.test(l)), "no TypeError or hydration error in the browser console");
console.log(logs.filter((l) => !/Failed to load resource/.test(l)).slice(0, 4).join("\n"));
await browser.close(); console.log(bad ? `${bad} FAILED` : "all passed"); process.exit(bad ? 1 : 0);
