import fs from "node:fs";
import { open, ctl, BASE, UID, sub } from "./lib.mjs";
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
const codes = [
  ["Cafe menu", "url", { url: "https://example.com/menu" }], ["Guest WiFi", "wifi", { ssid: "Guest", password: "welcome123", encryption: "WPA" }],
  ["Tola Ade", "vcard", { firstName: "Tola", lastName: "Ade", org: "Kitchen" }], ["Shop WhatsApp", "whatsapp", { phone: "2348000000000" }],
].map(([name, type, fields], i) => ({ id: `00000000-0000-4000-8000-00000000000${i + 1}`, user_id: UID, name, type, fields, style: { fg: "#1f4d3a", bg: "#ffffff", dots: "square", size: 512 }, created_at: new Date(Date.now() - i * 864e5).toISOString(), updated_at: new Date(Date.now() - i * 864e5).toISOString() }));
const sizes = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };
for (const [dev, vp] of Object.entries(sizes)) {
  const shot = async (page, name, opts = {}) => { await page.waitForTimeout(250); await page.screenshot({ path: `${OUT}/${dev}-${name}.png`, fullPage: true, ...opts }); };
  // anonymous / Free
  await ctl({ reset: true });
  let { browser, page } = await open(vp);
  await page.goto(BASE + "/"); await page.waitForLoadState("networkidle"); await shot(page, "01-landing");
  await page.goto(BASE + "/create"); await page.waitForSelector("#f-url");
  await page.fill("#f-url", "https://example.com/menu"); const nm = page.getByLabel(/name/i).first(); if (await nm.count()) await nm.fill("Cafe menu").catch(() => {});
  await shot(page, "02-create-content");
  await page.getByRole("tab", { name: "Appearance" }).click(); await shot(page, "03-create-appearance");
  await page.getByRole("tab", { name: "Content" }).click();
  await page.getByRole("radio", { name: /SVG/ }).check({ force: true }).catch(async () => { await page.getByText("SVG").first().click(); }); await shot(page, "04-export-format-restricted");
  await page.getByRole("radio", { name: /^PNG/ }).check({ force: true }).catch(() => {});
  await page.selectOption("#qr-type", { label: "Phone — Pro" }); await shot(page, "05-upgrade-prompt-paid-type");
  for (const [n, p] of [["07-pricing", "/pricing"], ["09-login", "/login"], ["11-forgot", "/forgot-password"], ["12-reset-expired", "/reset-password?state=expired"], ["13-confirm-email", "/confirm-email?email=you%40example.com"]]) { await page.goto(BASE + p); await page.waitForLoadState("networkidle"); await shot(page, n); }
  await page.goto(BASE + "/login"); const c = page.getByRole("button", { name: /create (an )?account|sign up/i }).first(); if (await c.count()) { await c.click(); await shot(page, "10-signup"); }
  await browser.close();
  // signed in, Pro with saved codes
  await ctl({ reset: true }); await ctl({ push: { subscriptions: [sub("pro", 22, { auto_renew: true, authorization_code: "AUTH_x" })], qr_codes: codes, payments: [{ reference: "qrf_demo", user_id: UID, plan: "pro", amount_kobo: 350000, status: "success", created_at: new Date(Date.now() - 8 * 864e5).toISOString() }] } });
  ({ browser, page } = await open({ ...vp, signedIn: true }));
  await page.goto(BASE + "/codes"); await page.waitForLoadState("networkidle"); await shot(page, "06-saved-codes");
  await page.goto(BASE + "/billing"); await page.waitForLoadState("networkidle"); await shot(page, "08-billing");
  await page.goto(BASE + "/account"); await page.waitForLoadState("networkidle"); await shot(page, "14-account");
  await page.goto(BASE + "/create"); await page.waitForSelector("#f-url"); await page.fill("#f-url", "https://example.com/menu"); await shot(page, "15-create-signed-in-pro");
  const f = page.locator("footer").last(); await f.scrollIntoViewIfNeeded(); await f.screenshot({ path: `${OUT}/${dev}-16-footer.png` });
  await browser.close();
}
console.log(fs.readdirSync(OUT).length, "screenshots");
