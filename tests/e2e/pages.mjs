// Hosted Digital Business Card, end to end in a real browser against the built app + local stand-ins (NOT real Supabase).
// Real here: the app code, the image pipeline (sharp), the vCard/QR bytes, the browser. Stand-in: PostgREST/Storage/auth.
import fs from "node:fs";
import { createRequire } from "node:module";
import { open, ctl, BASE, SP, UID, sub, staffSession } from "./lib.mjs";
const req = createRequire(process.env.REPO_PKG ?? "/home/claude/qrforge/package.json");
const sharp = req("sharp"); const jsQR = req("jsqr");
const axeSrc = fs.readFileSync(process.env.AXE_PATH ?? "node_modules/axe-core/axe.min.js", "utf8");
let bad = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
fs.mkdirSync(SP + "/pages", { recursive: true });
const OTHER = "99999999-9999-4999-8999-999999999999";

// test images: a landscape photo with EXIF GPS (must be stripped), a logo, junk files
const photo = await sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 200, g: 120, b: 60 } } })
  .composite([{ input: await sharp({ create: { width: 300, height: 600, channels: 3, background: { r: 20, g: 90, b: 160 } } }).png().toBuffer(), left: 0, top: 0 }])
  .withExif({ IFD0: { Copyright: "SECRET-EXIF-MARK" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "6/1 27/1 0/1" } }).jpeg().toBuffer();
const logo = await sharp({ create: { width: 400, height: 120, channels: 4, background: { r: 0, g: 100, b: 60, alpha: 0.9 } } }).png().toBuffer();
fs.writeFileSync(SP + "/pages/photo.jpg", photo); fs.writeFileSync(SP + "/pages/logo.png", logo);
fs.writeFileSync(SP + "/pages/evil.png", `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`);
fs.writeFileSync(SP + "/pages/fake.png", Buffer.from("this is not an image at all"));
fs.writeFileSync(SP + "/pages/big.png", Buffer.alloc(6 * 1024 * 1024, 1));

await ctl({ reset: true });
await ctl({ push: { subscriptions: [sub("pro", 20)] } });
const { browser, context, page, logs } = await open({ width: 1440, height: 1100, signedIn: true });
const api = (path, init) => page.evaluate(async ([p, i]) => { const r = await fetch(p, i); return { status: r.status, j: await r.json().catch(() => ({})) }; }, [path, init]);
const apiJson = (path, method, body) => api(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

// ---------- list + create ----------
await page.goto(BASE + "/workspace/pages", { waitUntil: "networkidle" });
ok(await page.getByText("No pages yet").isVisible(), "empty list state");
ok(await page.getByText("0 of 5 hosted pages used on your Pro plan").isVisible(), "usage shown against the plan limit");
await page.goto(BASE + "/workspace/pages/new", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Create card" }).click();
await page.getByText("Give the card a name").first().waitFor();
ok(true, "create refused without a card name");
await page.getByLabel("Card name").fill("Ada – work card");
await page.getByRole("button", { name: "Create card" }).click();
await page.waitForURL(/\/workspace\/pages\/[0-9a-f-]{36}$/);
const pageId = page.url().split("/").pop();
await page.getByLabel("Name", { exact: true }).waitFor();

// ---------- editing, validation ----------
await page.getByLabel("Name", { exact: true }).fill("Ada Obi");
await page.getByLabel("Job title").fill("Head of Product");
await page.getByLabel("Company").fill("Acme; Ltd, Nigeria");
await page.getByLabel("Introduction").fill("Line one\nLine two <b>not bold</b>");
await page.getByLabel("Phone number 1", { exact: true }).fill("0803 123 4567");
await page.getByLabel("Email address 1", { exact: true }).fill("ada@example.com");
await page.getByLabel("Website 1", { exact: true }).fill("acme.example");
await page.getByRole("button", { name: "Add phone number" }).click();
ok(await page.evaluate(() => document.activeElement?.id) === "phones-1", "focus moves to the new phone row");
await page.getByLabel("Phone number 2", { exact: true }).fill("+234 802 000 1111");
await page.getByLabel("Phone number 2 type").selectOption("work");
await page.getByLabel("Phone number 2", { exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded-control')][1]").getByLabel("WhatsApp button").check();
await page.getByRole("button", { name: "Add phone number" }).click();
await page.getByLabel("Phone number 3", { exact: true }).fill("+234 809 999 0000");
await page.getByLabel("Phone number 3", { exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded-control')][1]").getByLabel("Show on the card").uncheck(); // private
await page.getByRole("button", { name: "Add social profile" }).click();
await page.getByLabel("Social profile 1", { exact: true }).fill("ada.obi");
await page.getByRole("button", { name: "Save draft" }).click();
await page.getByText("Draft saved.").waitFor();
ok(true, "valid draft saved");
// invalid values are reported beside the row and keep focus management
await page.getByLabel("Email address 1", { exact: true }).fill("nope");
await page.getByLabel("Phone number 1", { exact: true }).fill("12");
await page.getByRole("button", { name: "Save draft" }).click();
await page.locator("#emails-0-err").waitFor();
ok((await page.locator("#phones-0-err").innerText()).includes("7 to 15 digits"), "phone error beside its row");
ok((await page.getByLabel("Email address 1", { exact: true }).getAttribute("aria-describedby")) === "emails-0-err", "error linked to input");
await page.getByLabel("Email address 1", { exact: true }).fill("ada@example.com");
await page.getByLabel("Phone number 1", { exact: true }).fill("0803 123 4567");
// duplicate rows
await page.getByRole("button", { name: "Add email address" }).click();
await page.getByLabel("Email address 2", { exact: true }).fill("ADA@example.com");
await page.getByRole("button", { name: "Save draft" }).click();
await page.locator("#emails-1-err").waitFor();
ok((await page.locator("#emails-1-err").innerText()).includes("repeats"), "duplicate email reported on the second row");
await page.getByRole("button", { name: "Remove email address 2" }).click();
ok(await page.getByLabel("Email address 1", { exact: true }).inputValue() === "ada@example.com", "removing a row never changes another row's value");

// ---------- photo: upload with keyboard reposition, replace, remove ----------
const photoInput = page.locator("input[type=file]").first();
await photoInput.setInputFiles(SP + "/pages/fake.png");
await page.getByText(/could not be read as an image|Use a PNG, JPEG or WebP/).first().waitFor();
ok(true, "browser-side refusal of a non-image file");
await photoInput.setInputFiles(SP + "/pages/photo.jpg");
const crop = page.getByRole("group", { name: /Photo position/ });
await crop.waitFor();
const imgLeft = () => crop.locator("img").evaluate((i) => i.style.left);
const l0 = await imgLeft();
await crop.focus();
for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
await page.keyboard.press("+"); await page.keyboard.press("+");
ok((await imgLeft()) !== l0, "keyboard arrows and + reposition/zoom the photo (no pointer needed)");
await page.getByRole("button", { name: "Use this photo" }).click();
await page.getByRole("img", { name: /Photo of Ada Obi/ }).first().waitFor();
const stored = await ctl();
const media = stored.tables.page_media ?? [];
ok(media.length === 1 && media[0].kind === "portrait" && media[0].vcf_bytes > 0, "portrait row recorded with a contact-file derivative");
const objs = Object.entries(stored.objects ?? {}).filter(([k]) => k.includes(pageId));
const mainObj = objs.find(([k]) => k.endsWith(".webp"));
const m = await sharp(Buffer.from(mainObj[1].data)).metadata();
ok(m.format === "webp" && m.width === 512 && m.height === 512 && !m.exif && !m.icc, "stored portrait: 512x512 WebP, no EXIF/GPS");
ok(!Buffer.from(mainObj[1].data).includes("SECRET-EXIF-MARK"), "EXIF marker absent from stored bytes");
ok((await sharp(Buffer.from(mainObj[1].data)).raw().toBuffer({ resolveWithObject: true })).info.channels >= 3, "stored portrait decodes");
await page.locator("input[type=file]").nth(1).setInputFiles(SP + "/pages/logo.png");
await page.getByRole("img", { name: "Your company logo" }).waitFor();
ok(true, "logo uploaded separately from the portrait");
await page.getByRole("button", { name: "Save draft" }).click();
await page.getByText("Draft saved.").waitFor();

// server-side refusals (never trusting the browser)
const uploadRaw = (file, kind = "portrait", type = "image/png") => page.evaluate(async ([id, f, k, t]) => {
  const bin = Uint8Array.from(atob(f), (c) => c.charCodeAt(0));
  const fd = new FormData(); fd.set("file", new File([bin], "x.png", { type: t })); fd.set("kind", k);
  const r = await fetch(`/api/pages/${id}/media`, { method: "POST", body: fd }); return { status: r.status, j: await r.json().catch(() => ({})) };
}, [pageId, fs.readFileSync(file).toString("base64"), kind, type]);
ok((await uploadRaw(SP + "/pages/evil.png")).status === 422, "SVG/script renamed .png refused by content");
ok((await uploadRaw(SP + "/pages/fake.png")).status === 422, "non-image refused by content");
ok([413, 422].includes((await uploadRaw(SP + "/pages/big.png")).status), "6 MB file refused");
ok((await api(`/api/pages/${pageId}/media`, { method: "POST", body: new FormData() })).status === 400, "missing kind refused");

// ---------- publish ----------
await page.getByRole("button", { name: "Publish", exact: true }).click();
await page.getByRole("dialog").getByText(/will be public/).waitFor();
const dtext = await page.getByRole("dialog").innerText();
ok(/1 hidden detail stays private/.test(dtext), "publish review states what stays private");
await page.getByRole("dialog").getByRole("button", { name: "Publish", exact: true }).click();
await page.getByText(/Published as version 1/).waitFor();
const addr = await page.locator("a", { hasText: /\/p\/[a-z2-9]{10}$/ }).first().innerText();
const publicId = addr.split("/p/")[1];
ok(/^[a-z2-9]{10}$/.test(publicId), "stable opaque public address");

// ---------- anonymous recipient ----------
const anon = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
const ap = await anon.newPage();
const alogs = []; ap.on("pageerror", (e) => alogs.push(e.message)); ap.on("console", (m) => m.type() === "error" && alogs.push(m.text()));
await ap.goto(`${BASE}/p/${publicId}`, { waitUntil: "networkidle" });
ok(await ap.getByRole("heading", { name: "Ada Obi" }).isVisible(), "recipient sees the card without signing in");
ok(await ap.getByText("Head of Product · Acme; Ltd, Nigeria").isVisible(), "role and company shown as text");
const html = await ap.content();
ok(!html.includes("+234 809 999 0000") && !html.includes("2348099990000"), "private phone absent from public HTML");
ok(!html.includes("<b>not bold</b>") && html.includes("&lt;b&gt;not bold&lt;/b&gt;"), "introduction rendered as text, HTML escaped");
const img = ap.getByRole("img", { name: "Photo of Ada Obi" });
ok(await img.evaluate((i) => i.complete && i.naturalWidth > 0), "portrait displays reliably for an anonymous visitor");
ok(await ap.getByRole("img", { name: "Acme; Ltd, Nigeria logo" }).evaluate((i) => i.complete && i.naturalWidth > 0), "logo displays");
ok((await ap.getByRole("link", { name: "Call" }).getAttribute("href")) === "tel:08031234567", "Call -> tel:");
ok((await ap.getByRole("link", { name: "WhatsApp" }).getAttribute("href")) === "https://wa.me/2348020001111", "WhatsApp -> wa.me with international number");
ok((await ap.getByRole("link", { name: "Email", exact: true }).getAttribute("href")) === "mailto:ada@example.com", "Email -> mailto:");
ok((await ap.getByRole("link", { name: "Website" }).getAttribute("href")) === "https://acme.example/", "Website -> https");
ok(await ap.getByRole("button", { name: "Share" }).isVisible(), "Share present");
ok(await ap.getByRole("link", { name: "Save contact" }).isVisible(), "Save contact present");
ok(await ap.locator("nav, header a[href='/login']").count() === 0 || !(await ap.getByRole("link", { name: "Sign in" }).count()), "no Qrenuvi account navigation on recipient page");
ok((await ap.locator("body").evaluate((b) => b.scrollWidth <= innerWidth)), "no horizontal scroll at 390px");
ok((await ap.locator('meta[name=robots]').getAttribute("content")).includes("noindex"), "recipient page is noindex");
await ap.screenshot({ path: SP + "/pages/card-390.png", fullPage: true });
// raw public API surface: draft-only media is not served; owner media route needs sign-in
const mediaId = media[0].id;
const pubImg = await anon.request.get(`${BASE}/p/${publicId}/media/${mediaId}`);
ok(pubImg.status() === 200 && pubImg.headers()["content-type"] === "image/webp", "public image route serves the published image");
ok((await anon.request.get(`${BASE}/api/pages/${pageId}/media/${mediaId}`)).status() === 401, "owner image route refuses anonymous visitors");
ok((await anon.request.get(`${BASE}/p/${publicId}/media/00000000-0000-4000-8000-000000000000`)).status() === 404, "unknown image id -> 404");

// ---------- contact file ----------
const vcfRes = await anon.request.get(`${BASE}/p/${publicId}/contact.vcf`);
const vbuf = await vcfRes.body(); const vtxt = vbuf.toString("latin1");
ok(vcfRes.headers()["content-type"].startsWith("text/vcard") && /attachment; filename="Ada-Obi\.vcf"/.test(vcfRes.headers()["content-disposition"]), "contact file headers");
ok(vtxt.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\n") && vtxt.endsWith("END:VCARD\r\n"), "vCard 3.0, CRLF line endings");
const lines = vtxt.split("\r\n");
ok(lines.every((l) => Buffer.byteLength(l, "latin1") <= 75), "every line folded to 75 octets or fewer");
const unfolded = vtxt.replace(/\r\n[ \t]/g, "");
ok(unfolded.includes("FN:Ada Obi") && unfolded.includes("ORG:Acme\\; Ltd\\, Nigeria") && unfolded.includes("TITLE:Head of Product"), "name, escaped company, title");
ok((unfolded.match(/^TEL;/gm) ?? []).length === 2 && unfolded.includes("TEL;TYPE=WORK:+234 802 000 1111"), "repeated public TEL rows only");
ok(!unfolded.includes("809 999 0000"), "private number not in the contact file");
ok(/^URL:https:\/\/acme\.example\/$/m.test(unfolded) && /^URL:https:\/\/instagram\.com\/ada\.obi$/m.test(unfolded), "website and social profile as URL properties");
const ph = /^PHOTO;ENCODING=b;TYPE=JPEG:([A-Za-z0-9+/=]+)$/m.exec(unfolded);
ok(!!ph, "PHOTO property present");
const pj = Buffer.from(ph[1], "base64"); const pm = await sharp(pj).metadata();
ok(pm.format === "jpeg" && pm.width === 192 && pm.height === 192 && pj.length < 20_000 && !pm.exif, `embedded photo: 192x192 JPEG, ${pj.length} bytes, no EXIF`);
fs.writeFileSync(SP + "/pages/ada.vcf", vbuf);

// ---------- QR round trip ----------
const qr = await context.request.get(`${BASE}/api/pages/${pageId}/qr?format=png`);
const png = await sharp(await qr.body()).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const dec = jsQR(new Uint8ClampedArray(png.data), png.info.width, png.info.height);
ok(dec?.data === `${BASE}/p/${publicId}`, "QR code decodes to the card's permanent address");
const svg = await (await context.request.get(`${BASE}/api/pages/${pageId}/qr?format=svg`)).text();
ok(svg.startsWith("<svg") || svg.includes("<svg"), "QR SVG download");

// ---------- edit after publish: public unchanged until republish ----------
await page.getByLabel("Job title").fill("Chief Product Officer");
await page.getByRole("button", { name: "Save draft" }).click(); await page.getByText("Draft saved.").waitFor();
await ap.reload({ waitUntil: "networkidle" });
ok(await ap.getByText("Head of Product").isVisible(), "saved draft does not change the live card");
await page.getByRole("button", { name: "Publish changes" }).click();
await page.getByRole("dialog").getByRole("button", { name: "Publish changes" }).click();
await page.getByText(/Published as version 2/).waitFor();
await ap.reload({ waitUntil: "networkidle" });
ok(await ap.getByText("Chief Product Officer").isVisible(), "republish updates the same address");
ok(page.url().includes(pageId) && (await page.locator("a", { hasText: /\/p\// }).first().innerText()).endsWith(publicId), "address unchanged after republish");
// revisions
await page.getByRole("button", { name: "Copy version 1 into my draft" }).click();
await page.getByText(/Version 1 copied into your draft/).waitFor();
ok((await page.getByLabel("Job title").inputValue()) === "Head of Product", "revision copied into draft (not published)");
await ap.reload({ waitUntil: "networkidle" });
ok(await ap.getByText("Chief Product Officer").isVisible(), "restoring does not publish");

// ---------- conflict: changed elsewhere ----------
await ctl({ set: {} });
const t = (await ctl()).tables.pages.find((p) => p.id === pageId);
await fetch("http://localhost:54321/rest/v1/pages?id=eq." + pageId, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ draft_version: t.draft_version + 5, title: "Changed elsewhere" }) });
await page.getByLabel("Company").fill("My unsaved company");
await page.getByRole("button", { name: "Save draft" }).click();
await page.getByRole("alertdialog").waitFor();
ok(await page.getByLabel("Company").inputValue() === "My unsaved company", "conflict keeps my edits on screen");
ok((await page.getByRole("alertdialog").innerText()).includes("Another tab or device"), "conflict explains and offers choices");
await page.getByRole("button", { name: "Keep my edits" }).click();
await page.getByRole("button", { name: "Save draft" }).click(); await page.getByText("Draft saved.").waitFor();
ok(true, "after choosing to keep edits, save succeeds on the latest version");

// ---------- tenant isolation (owner filter) ----------
await ctl({ push: { subscriptions: [sub("pro", 20, { user_id: OTHER })] } });
const foreign = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", user_id: OTHER, kind: "card", title: "Not mine", public_id: "zzzzzzzzzz", draft: { name: "Victim" }, draft_version: 1, lifecycle: "draft" };
await fetch("http://localhost:54321/rest/v1/pages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(foreign) });
const fid = (await ctl()).tables.pages.find((p) => p.public_id === "zzzzzzzzzz").id;
ok((await apiJson(`/api/pages/${fid}`, "PUT", { title: "pwn", card: {}, expectedVersion: 1 })).status === 404, "cannot save another user's page");
ok((await apiJson(`/api/pages/${fid}/publish`, "POST", { expectedVersion: 1 })).status === 404, "cannot publish another user's page");
ok((await api(`/api/pages/${fid}`, { method: "DELETE" })).status === 404, "cannot delete another user's page");
ok((await apiJson(`/api/pages/${fid}/unpublish`, "POST", {})).status === 404, "cannot unpublish another user's page");
ok((await api(`/api/pages/${fid}/qr`)).status === 404, "cannot fetch another user's QR");
await page.goto(`${BASE}/workspace/pages/${fid}`, { waitUntil: "load" }); await page.waitForTimeout(800);
ok(!(await page.content()).includes("Victim"), "another user's editor page does not render (not found)");
// cross-site writes blocked
const x = await context.request.post(`${BASE}/api/pages`, { headers: { origin: "https://evil.example", "content-type": "application/json" }, data: { title: "x" } });
ok(x.status() === 403, "cross-site create blocked");
// anonymous API
ok((await anon.request.post(`${BASE}/api/pages`, { data: { title: "x" } })).status() === 401, "anonymous create -> 401");
// unknown ids -> neutral unavailable
await ap.goto(`${BASE}/p/abcdefghjk`, { waitUntil: "networkidle" });
ok(await ap.getByText("This page isn’t available").isVisible(), "unknown address shows the neutral unavailable page");
ok(!(await ap.content()).includes("tester@example.com"), "unavailable page reveals no account information");

// ---------- unpublish / delete ----------
await page.goto(`${BASE}/workspace/pages/${pageId}`, { waitUntil: "load" }); await page.waitForTimeout(800);
await page.getByRole("button", { name: "Unpublish" }).click();
await page.getByRole("dialog").getByRole("button", { name: "Unpublish" }).click();
await page.getByText(/Unpublished\. The link now shows/).waitFor();
await ap.goto(`${BASE}/p/${publicId}`, { waitUntil: "networkidle" });
ok(await ap.getByText("This page isn’t available").isVisible(), "unpublished card shows the unavailable page");
ok((await anon.request.get(`${BASE}/p/${publicId}/contact.vcf`)).status() === 404, "contact file gone after unpublish");
ok((await anon.request.get(`${BASE}/p/${publicId}/media/${mediaId}`)).status() === 404, "image gone after unpublish");
await page.reload({ waitUntil: "load" }); await page.getByLabel("Name", { exact: true }).waitFor();
ok(await page.getByText(/Unpublished/).first().isVisible() && await page.getByLabel("Name", { exact: true }).inputValue() === "Ada Obi", "unpublished card stays editable and intact");
await page.getByRole("button", { name: "Publish", exact: true }).click();
await page.getByRole("dialog").getByRole("button", { name: "Publish", exact: true }).click();
await page.getByText(/Published as version 3/).waitFor();
await ap.reload({ waitUntil: "networkidle" });
ok(await ap.getByRole("heading", { name: "Ada Obi" }).isVisible(), "republish after unpublish restores the same address");

// ---------- staff takedown (Support/Owner only; no content access) ----------
{
  const SID = (n) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
  await ctl({ tables: { staff_members: [
    { user_id: SID(1), email: "owner@example.com", role: "owner", extra_grants: [], state: "active", version: 1 },
    { user_id: SID(2), email: "support@example.com", role: "support", extra_grants: [], state: "active", version: 1 },
    { user_id: SID(4), email: "editor@example.com", role: "content_editor", extra_grants: [], state: "active", version: 1 },
  ] } });
  const call = async (cookie, action, reason = "Abuse report #1234") => { const r = await fetch(`${BASE}/api/admin/pages`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ action, page_id: pageId, reason }) }); return r.status; };
  const editor = await staffSession(SID(4), "editor@example.com"); const support = await staffSession(SID(2), "support@example.com");
  ok((await call(editor, "takedown")) === 403, "Content Editor cannot take a page down");
  ok((await call(await staffSession(SID(2), "support@example.com", { lastSignIn: Date.now() - 20 * 60e3 }), "takedown")) === 403, "takedown needs a recent sign-in (step-up)");
  ok((await call(support, "takedown", "x")) === 422, "takedown needs a real reason");
  ok((await call(support, "takedown")) === 200, "Support can take a page down");
  await ap.goto(`${BASE}/p/${publicId}?td=1`, { waitUntil: "networkidle" });
  ok(await ap.getByText("This page isn’t available").isVisible(), "taken-down page is unavailable at once");
  ok((await anon.request.get(`${BASE}/p/${publicId}/contact.vcf`)).status() === 404, "taken-down: contact file gone");
  ok((await apiJson(`/api/pages/${pageId}/publish`, "POST", { expectedVersion: (await ctl()).tables.pages.find((p) => p.id === pageId).draft_version })).status === 403, "owner cannot republish a taken-down page");
  ok(!(JSON.stringify((await ctl()).log.filter((l) => l.op === "insert" && l.table === "audit_events"))).includes("Ada Obi"), "audit entry holds no page content");
  ok((await call(support, "restore")) === 200, "Support can lift the takedown");
  await ap.goto(`${BASE}/p/${publicId}?td=2`, { waitUntil: "networkidle" });
  ok(await ap.getByRole("heading", { name: "Ada Obi" }).isVisible(), "page is back after takedown is lifted");
  const audits = ((await ctl()).tables.audit_events ?? []).filter((a) => a.action?.startsWith("page."));
  ok(audits.length === 2 && audits.every((a) => a.target_type === "page" && a.actor_role === "support"), "both actions audited with actor and role");
}

// ---------- plan lifecycle: lapse -> grace -> unavailable ----------
await ctl({ set: { subscriptions: [sub("pro", -3), sub("pro", 20, { user_id: OTHER })] } });
await ap.goto(`${BASE}/p/${publicId}?t=1`, { waitUntil: "networkidle" });
ok(await ap.getByRole("heading", { name: "Ada Obi" }).isVisible(), "lapsed plan: card stays visible during the 30-day grace period");
await page.goto(`${BASE}/workspace/pages/${pageId}`, { waitUntil: "load" }); await page.waitForTimeout(800);
ok(await page.getByText("Editing needs an active Pro or Business plan").isVisible(), "lapsed plan: editor read-only notice");
ok(await page.getByRole("button", { name: "Save draft" }).isDisabled(), "lapsed plan: cannot save");
ok((await apiJson(`/api/pages/${pageId}`, "PUT", { title: "x", card: {}, expectedVersion: 1 })).status === 403, "lapsed plan: save API refuses");
ok((await apiJson(`/api/pages`, "POST", { title: "x" })).status === 403, "lapsed plan: cannot create");
ok(!(await page.getByRole("button", { name: "Unpublish" }).isDisabled()), "lapsed plan: can still unpublish");
await ctl({ set: { subscriptions: [sub("pro", -45), sub("pro", 20, { user_id: OTHER })] } });
await anon.clearCookies();
const late = await anon.newPage();
await late.goto(`${BASE}/p/${publicId}?t=2`, { waitUntil: "networkidle" });
// cached for up to a minute: force expiry by republish-independent check on a fresh public id path via the vcf route (uncached)
ok((await anon.request.get(`${BASE}/p/${publicId}/contact.vcf`)).status() === 404, "plan lapsed beyond grace: contact file unavailable");
ok((await anon.request.get(`${BASE}/p/${publicId}/media/${mediaId}`)).status() === 404, "plan lapsed beyond grace: image unavailable");
await ctl({ set: { subscriptions: [sub("pro", 20), sub("pro", 20, { user_id: OTHER })] } });

// ---------- Free plan ----------
await ctl({ set: { subscriptions: [] } });
await page.goto(`${BASE}/workspace/pages/new`, { waitUntil: "networkidle" });
ok(await page.getByText("Digital business cards need Pro or Business").isVisible(), "Free: upgrade prompt, not a dead end");
ok((await apiJson(`/api/pages`, "POST", { title: "x" })).status === 403, "Free: create API refuses");
ok((await page.request.get(`${BASE}/create`)).status() === 200, "static generator unaffected");

// ---------- layout, keyboard, zoom, axe ----------
await ctl({ set: { subscriptions: [sub("pro", 20)] } });
for (const [w, label] of [[1440, "desktop"], [390, "mobile"], [320, "200%-zoom equivalent"]]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.goto(`${BASE}/workspace/pages/${pageId}`, { waitUntil: "load" }); await page.waitForTimeout(800);
  await page.getByLabel("Name", { exact: true }).waitFor();
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `editor has no horizontal scroll @${w} (${label})`);
  await page.screenshot({ path: `${SP}/pages/editor-${w}.png`, fullPage: true });
  await page.addScriptTag({ content: axeSrc });
  const v = await page.evaluate(async () => (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })).violations.map((x) => x.id + ":" + x.nodes.length));
  ok(v.length === 0, `axe: editor @${w} ${v.join(",")}`);
}
for (const w of [390, 320]) {
  await ap.setViewportSize({ width: w, height: 800 });
  await ap.goto(`${BASE}/p/${publicId}?z=${w}`, { waitUntil: "networkidle" });
  ok(await ap.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `public card no horizontal scroll @${w}`);
  await ap.addScriptTag({ content: axeSrc });
  const v = await ap.evaluate(async () => (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })).violations.map((x) => x.id + ":" + x.nodes.length));
  ok(v.length === 0, `axe: public card @${w} ${v.join(",")}`);
}
// keyboard-only: tab order reaches Save contact
await ap.setViewportSize({ width: 390, height: 800 });
await ap.goto(`${BASE}/p/${publicId}?k=1`, { waitUntil: "networkidle" });
let reached = false; for (let i = 0; i < 20 && !reached; i++) { await ap.keyboard.press("Tab"); reached = await ap.evaluate(() => document.activeElement?.textContent === "Save contact"); }
ok(reached, "keyboard Tab reaches Save contact on the card");
ok(logs.filter((l) => !/favicon|404|401|403|422|413|409|400/.test(l)).length === 0 && alogs.filter((l) => !/404|401|403/.test(l)).length === 0, "no unexpected console errors " + JSON.stringify([...logs, ...alogs].slice(0, 4)));
await browser.close();
console.log(bad ? `\n${bad} FAILED` : "\nALL PASSED"); process.exit(bad ? 1 : 0);
