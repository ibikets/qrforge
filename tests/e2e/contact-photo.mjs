// Static contact code with an optional photo: browser crop (keyboard), photo only in the .vcf, QR stays photo-free, save/reload, server checks.
import fs from "node:fs";
import { createRequire } from "node:module";
import { open, ctl, BASE, SP, sub } from "./lib.mjs";
const req = createRequire(process.env.REPO_PKG ?? "/home/claude/qrforge/package.json");
const sharp = req("sharp"); const jsQR = req("jsqr");
let bad = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
fs.mkdirSync(SP + "/contact", { recursive: true });
const photo = await sharp({ create: { width: 800, height: 500, channels: 3, background: { r: 30, g: 120, b: 90 } } }).withExif({ IFD0: { Copyright: "SECRET-EXIF-MARK" } }).jpeg().toBuffer();
fs.writeFileSync(SP + "/contact/p.jpg", photo);
await ctl({ reset: true }); await ctl({ push: { subscriptions: [sub("pro", 20)] } });
const { browser, page, logs } = await open({ width: 1440, height: 1100, signedIn: true });
await page.goto(BASE + "/create", { waitUntil: "networkidle" });
await page.getByLabel("Type", { exact: true }).selectOption("vcard");
await page.getByLabel("First name").fill("Ada"); await page.getByLabel("Last name").fill("Obi");
await page.getByLabel("Phone 1", { exact: true }).fill("+234 800 000 0000");
ok(await page.getByRole("img", { name: "No photo. Initials are used." }).isVisible(), "initials fallback when there is no photo");
await page.getByLabel("Add photo").setInputFiles(SP + "/contact/p.jpg");
const crop = page.getByRole("group", { name: /Photo position/ }); await crop.waitFor();
const left0 = await crop.locator("img").evaluate((i) => i.style.left);
await crop.focus(); for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowLeft"); await page.keyboard.press("+");
ok((await crop.locator("img").evaluate((i) => i.style.left)) !== left0, "keyboard repositions and zooms");
await page.getByRole("button", { name: "Use this photo" }).click();
await page.getByRole("img", { name: "Photo of Ada Obi" }).waitFor();
ok(true, "photo chosen, cropped and shown");
// QR payload is photo-free and decodes
const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /^Download PNG/ }).click()]);
await dl.saveAs(SP + "/contact/qr.png");
const png = await sharp(SP + "/contact/qr.png").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const text = jsQR(new Uint8ClampedArray(png.data), png.info.width, png.info.height)?.data ?? "";
ok(text.startsWith("BEGIN:VCARD") && !text.includes("PHOTO") && text.includes("FN:Ada Obi"), `QR decodes to a photo-free vCard (${text.length} chars)`);
// contact file has the photo
const [vd] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download contact file (.vcf)" }).click()]);
await vd.saveAs(SP + "/contact/ada.vcf");
const raw = fs.readFileSync(SP + "/contact/ada.vcf", "latin1");
ok(raw.includes("\r\n") && raw.split("\r\n").every((l) => l.length <= 75), "contact file: CRLF and folded lines");
const unf = raw.replace(/\r\n /g, "");
const m = /^PHOTO;ENCODING=b;TYPE=JPEG:(\S+)$/m.exec(unf.replace(/\r/g, ""));
ok(!!m, "contact file contains a PHOTO property");
const pj = Buffer.from(m[1], "base64"); const pm = await sharp(pj).metadata();
ok(pm.format === "jpeg" && pm.width === pm.height && pm.width <= 160 && pj.length < 7000 && !pm.exif && !pj.includes("SECRET-EXIF-MARK"), `embedded photo is a ${pm.width}px JPEG of ${pj.length} bytes with no EXIF`);
ok(unf.includes("FN:Ada Obi") && unf.includes("TEL;TYPE=CELL:+234 800 000 0000"), "contact file keeps the normal details");
// save, reload, edit keeps the photo; QR still photo-free
await page.locator("#code-name").fill("Ada card");
await page.getByRole("button", { name: "Save to my codes" }).click();
await page.getByText("Saved to My codes.").first().waitFor({ timeout: 8000 });
const row = (await ctl()).qr_codes.at(-1);
ok(row.fields.photo && row.fields.photo.length <= 9000 && row.fields.phone === "+234 800 000 0000", "saved record carries the small photo alongside the usual fields");
await page.goto(BASE + "/codes", { waitUntil: "networkidle" });
await page.getByRole("link", { name: /Edit|Open/ }).first().click(); await page.waitForLoadState("networkidle");
await page.getByRole("img", { name: "Photo of Ada Obi" }).waitFor();
ok(true, "reopening the saved code restores the photo");
await page.getByRole("button", { name: "Remove photo" }).click();
ok(await page.getByRole("img", { name: "No photo. Initials are used." }).isVisible(), "photo removed, initials return");
// an old saved record (no photo key) still opens
await fetch("http://localhost:54321/rest/v1/qr_codes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user_id: "11111111-1111-4111-8111-111111111111", name: "Legacy", type: "vcard", fields: { firstName: "Old", lastName: "Record", phone: "+2348111111111" }, style: {} }) });
await page.goto(BASE + "/codes", { waitUntil: "networkidle" });
ok(await page.getByText("Legacy").first().isVisible(), "records saved before photos existed still list");
// server refuses a forged photo
const forged = await page.evaluate(async () => (await fetch("/api/codes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "x", type: "vcard", fields: { firstName: "A", photo: "/9j/AAAA" }, style: {} }) })).status);
ok(forged === 400, "server rejects a photo that is not a real small JPEG");
const huge = await page.evaluate(async () => (await fetch("/api/codes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "x", type: "vcard", fields: { firstName: "A", photo: "/9j/" + "A".repeat(20000) }, style: {} }) })).status);
ok(huge === 400, "server rejects an oversized photo");
ok(logs.filter((l) => !/40\d|409/.test(l)).length === 0, "no console errors " + JSON.stringify(logs.slice(0, 3)));
await browser.close(); console.log(bad ? `\n${bad} FAILED` : "\nALL PASSED"); process.exit(bad ? 1 : 0);
