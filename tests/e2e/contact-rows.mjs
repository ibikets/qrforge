// Contact (vCard) form with repeatable rows, in a real browser against the built app + stand-ins.
// Covers: + at the end of each first row, remove buttons, limits, errors beside the row, labels, keyboard focus,
// draft restoration, save -> reload -> edit, PNG download decoded back to the vCard, layout at 1440/390/320, axe.
import fs from "node:fs";
import { createRequire } from "node:module";
import { open, ctl, BASE, SP, UID, staffSession } from "./lib.mjs";
import { seed, IDS } from "./seed-admin.mjs";
const req = createRequire(process.env.REPO_PKG ?? "/home/claude/qrforge/package.json");
const sharp = req("sharp"); const jsQR = req("jsqr");
const axeSrc = fs.readFileSync(process.env.AXE_PATH ?? "node_modules/axe-core/axe.min.js", "utf8");
let bad = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
fs.mkdirSync(SP + "/contact", { recursive: true });
await seed({});

async function pick(page) {
  await page.goto(BASE + "/create", { waitUntil: "networkidle" });
  await page.getByLabel("Type", { exact: true }).selectOption("vcard");
  await page.getByLabel("First name").fill("Ada");
}
const groups = ["phone number", "email address", "website", "social profile"];

for (const w of [1440, 390, 320]) {
  const { browser, page, logs } = await open({ width: w, height: w > 600 ? 1000 : 800, signedIn: true });
  await pick(page);
  // + at the end of the first row of every group, labelled
  for (const g of groups) ok(await page.getByRole("button", { name: `Add another ${g}` }).isVisible(), `@${w} "+" button for ${g}`);
  const plus = page.getByRole("button", { name: "Add another phone number" });
  const first = page.getByLabel("Phone 1", { exact: true });
  const bp = await plus.boundingBox(), bi = await first.boundingBox();
  ok(Math.abs((bp.y + bp.height / 2) - (bi.y + bi.height / 2)) < 6 && bp.x > bi.x + bi.width - 2, `@${w} "+" sits at the end of the first row`);
  ok(bp.width >= 44 && bp.height >= 44, `@${w} "+" is at least 44px`);
  ok(await page.getByRole("button", { name: /^Remove phone/ }).count() === 0, `@${w} no remove button on the first row`);

  // add rows and fill
  await plus.click();
  ok(await page.evaluate(() => document.activeElement?.id) === "f-phone_2", `@${w} focus moves into the new row`);
  await page.getByLabel("Phone 2", { exact: true }).fill("+234 801 111 1111");
  await page.getByLabel("Phone 2 type").selectOption("work");
  await page.getByLabel("Phone 1", { exact: true }).fill("+234 800 000 0000");
  ok(await page.getByRole("button", { name: "Remove phone 2" }).isVisible(), `@${w} added row has a remove button`);
  await page.getByRole("button", { name: "Add another email address" }).click();
  await page.getByLabel("Email 1", { exact: true }).fill("ada@example.com");
  await page.getByLabel("Email 2", { exact: true }).fill("ADA@example.com");
  // duplicate beside the right row, not the first
  const dupErr = page.locator("#f-email_2-err");
  await dupErr.waitFor({ timeout: 3000 });
  ok((await dupErr.innerText()) === "Already added above." && await page.locator("#f-email-err").count() === 0, `@${w} duplicate email is reported beside row 2`);
  ok((await page.getByLabel("Email 2", { exact: true }).getAttribute("aria-describedby")) === "f-email_2-err", `@${w} error is linked to its input`);
  await page.getByLabel("Email 2", { exact: true }).fill("not-an-email");
  await page.locator("#f-email_2-err").waitFor();
  ok(/valid email/.test(await page.locator("#f-email_2-err").innerText()), `@${w} invalid email is explained`);
  await page.getByLabel("Email 2", { exact: true }).fill("ada.work@example.com");
  await page.getByRole("button", { name: "Add another website" }).click();
  await page.getByLabel("Website 1", { exact: true }).fill("https://example.com");
  await page.getByLabel("Website 2", { exact: true }).fill("portfolio.example.org");
  await page.getByRole("button", { name: "Add another social profile" }).click();
  await page.getByLabel("Social 1", { exact: true }).fill("adaobi");
  await page.getByLabel("Social 2 type").selectOption("linkedin");
  await page.getByLabel("Social 2", { exact: true }).fill("ada-obi");
  // limit
  for (let i = 0; i < 6; i++) { const b = page.getByRole("button", { name: "Add another phone number" }); if (await b.isDisabled()) break; await b.click(); }
  ok(await page.getByRole("button", { name: "Add another phone number" }).isDisabled() && (await page.locator("body").innerText()).includes("You can add up to 5 phone numbers."), `@${w} the limit is enforced and explained`);
  ok(await page.getByLabel("Phone 5", { exact: true }).count() === 1 && await page.getByLabel("Phone 6", { exact: true }).count() === 0, `@${w} exactly five rows`);
  // empty extra rows are fine; remove them
  await page.getByRole("button", { name: "Remove phone 5" }).click();
  await page.getByRole("button", { name: "Remove phone 4" }).click();
  await page.getByRole("button", { name: "Remove phone 3" }).click();
  ok(await page.evaluate(() => document.activeElement?.id) === "add-phone", `@${w} after remove, focus returns to the "+" of that group`);
  ok(await page.getByLabel("Phone 3", { exact: true }).count() === 0 && (await page.getByLabel("Phone 2", { exact: true }).inputValue()) === "+234 801 111 1111", `@${w} remove keeps the other rows`);
  ok(await page.getByText("Phone 3 removed.").count() === 1, `@${w} removal is announced to screen readers`);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(over <= 0, `@${w} no horizontal overflow (${over}px)`);
  await page.screenshot({ path: `${SP}/contact/rows_${w}.png`, fullPage: true });
  await page.evaluate(axeSrc);
  const ax = await page.evaluate(async () => (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] })).violations.map((x) => x.id + "×" + x.nodes.length));
  ok(ax.length === 0, `@${w} axe: ${ax.join(",") || "0 violations"}`);
  // keyboard: tab from the first phone input reaches "+" next
  await page.getByLabel("Phone 1", { exact: true }).focus(); await page.keyboard.press("Tab");
  ok(await page.evaluate(() => document.activeElement?.id) === "add-phone", `@${w} Tab goes from the row to its "+"`);

  if (w === 1440) {
    // download PNG and decode it back
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /^Download PNG/ }).click()]);
    const file = SP + "/contact/dl.png"; await dl.saveAs(file);
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const q = jsQR(new Uint8ClampedArray(data), info.width, info.height);
    const text = q?.data ?? "";
    console.log("   decoded vCard:", JSON.stringify(text));
    ok(text.startsWith("BEGIN:VCARD") && (text.match(/^TEL;/gm) ?? []).length === 2 && (text.match(/^EMAIL;/gm) ?? []).length === 2 && (text.match(/^URL:/gm) ?? []).length === 4, "downloaded PNG decodes to a vCard with 2 TEL, 2 EMAIL and 4 URL properties");
    ok(text.includes("URL:https://linkedin.com/in/ada-obi") && text.includes("TEL;TYPE=WORK:+234 801 111 1111"), "decoded vCard carries the labels and social profile address");

    // save, reload, edit
    await page.locator("#code-name").fill("Ada card");
    await page.getByRole("button", { name: "Save to my codes" }).click();
    await page.getByText("Saved to My codes.").first().waitFor({ timeout: 8000 });
    const saved = await ctl({ tables: true }).catch(() => null);
    await page.goto(BASE + "/codes", { waitUntil: "networkidle" });
    const edit = page.getByRole("link", { name: /Edit|Open/ }).first();
    ok(await edit.count() > 0, "saved contact card appears in My codes");
    await edit.click(); await page.waitForLoadState("networkidle");
    ok((await page.getByLabel("Phone 2", { exact: true }).inputValue()) === "+234 801 111 1111" && (await page.getByLabel("Phone 2 type").inputValue()) === "work", "reopening the saved code restores row 2 and its label");
    ok((await page.getByLabel("Social 2", { exact: true }).inputValue()) === "ada-obi" && (await page.getByLabel("Social 2 type").inputValue()) === "linkedin", "reopening restores the social row and platform");
    ok((await page.getByLabel("Website 2", { exact: true }).inputValue()) === "portfolio.example.org", "reopening restores website row 2");
    await page.getByLabel("Phone 2", { exact: true }).fill("+234 802 222 2222");
    await page.getByRole("button", { name: "Update saved code" }).click();
    await page.getByText("Saved to My codes.").first().waitFor({ timeout: 8000 });
    await page.reload({ waitUntil: "networkidle" });
    ok((await page.getByLabel("Phone 2", { exact: true }).inputValue()) === "+234 802 222 2222", "edits to a repeated row are saved");
  }
  const errs = logs.filter((l) => !/status of (4|5)\d\d|ERR_FAILED|ERR_ABORTED/.test(l));
  ok(errs.length === 0, `@${w} no console errors${errs.length ? ": " + errs.join("|").slice(0, 160) : ""}`);
  await browser.close();
}

// draft restoration (same-tab sessionStorage draft written in the format the app uses)
{
  const { browser, page } = await open({ width: 1024, signedIn: true });
  await page.goto(BASE + "/create", { waitUntil: "networkidle" });
  const id = "dddddddd-0000-4000-8000-000000000001";
  await page.evaluate(([id]) => sessionStorage.setItem("qrf:draft", JSON.stringify({ v: 1, id, t: Date.now(), d: { type: "vcard", fields: { firstName: "Ada", phone: "+234 800 000 0000", phone_2: "+234 801 111 1111", phone_2_type: "work", email: "a@example.com", email_2: "", social: "adaobi", social_type: "x" }, name: "d", fg: "#000000", bg: "#ffffff", dots: "square", size: 512, format: "png", logo: null, logoName: null } })), [id]);
  await page.goto(`${BASE}/create?draft=${id}`, { waitUntil: "networkidle" });
  ok((await page.getByLabel("Phone 2", { exact: true }).inputValue()) === "+234 801 111 1111" && (await page.getByLabel("Phone 2 type").inputValue()) === "work", "draft restores a repeated phone row with its label");
  ok(await page.getByLabel("Email 2", { exact: true }).count() === 1 && (await page.getByLabel("Social 1 type").inputValue()) === "x", "draft restores an empty added row and the social platform");
  await browser.close();
}

// server side: the save and generate endpoints use the same validation
{
  const { browser, context, page } = await open({ width: 1024, signedIn: true });
  const post = (p, b) => page.request.post(BASE + p, { data: b, headers: { origin: BASE } });
  const base = { name: "x", type: "vcard", style: { fg: "#000000", bg: "#ffffff", dots: "square", size: 512 } };
  let r = await post("/api/codes", { ...base, fields: { firstName: "A", phone: "+234 800 000 0000", phone_2: "+234-800-000-0000" } });
  ok(r.status() === 400 && (await r.json()).field === "phone_2", "API refuses a duplicate row and names the row");
  r = await post("/api/codes", { ...base, fields: { firstName: "A", phone_9: "1234567" } });
  ok(r.ok() && !JSON.stringify(await r.json()).includes("phone_9"), "API drops keys outside the allowed rows before saving");
  r = await post("/api/codes", { ...base, fields: { firstName: "A", email_3: "bad" } });
  ok(r.status() === 400, "API validates later rows");
  await browser.close();
}
// management portal: staff see how many details a contact card holds, never the values
{
  await seed({ push: { qr_codes: [
    { id: "cccccccc-0000-4000-8000-000000000001", user_id: UID, name: "Ada card", type: "vcard", fields: { firstName: "Ada", phone: "+234 800 000 0000", phone_2: "+234 801 111 1111", email: "ada.secret@example.com", social: "adaobi", social_type: "instagram", website_2: "" }, updated_at: new Date().toISOString() },
    { id: "cccccccc-0000-4000-8000-000000000002", user_id: UID, name: "Menu", type: "url", fields: { url: "https://private-menu.example.com" }, updated_at: new Date().toISOString() },
  ] } });
  const { browser, context, page } = await open({ width: 1440 });
  for (const [role, id, email, expectPanel] of [["owner", IDS.owner, "owner@example.com", true], ["support", IDS.support, "support@example.com", true], ["billing", IDS.billing, "billing@example.com", false]]) {
    const ck = await staffSession(id, email); const [n, ...v] = ck.split("=");
    await context.clearCookies(); await context.addCookies([{ name: n, value: v.join("="), domain: "localhost", path: "/" }]);
    await page.goto(`${BASE}/admin/customers/${UID}`, { waitUntil: "networkidle" });
    const t = await page.locator("main").innerText();
    if (expectPanel) {
      ok(t.includes("Saved codes") && t.includes("Ada card") && /2 phone numbers · 1 email address · 1 social profile/.test(t), `${role}: customer detail shows the saved contact card with counts`);
      ok(!t.includes("ada.secret@example.com") && !t.includes("+234 800 000 0000") && !t.includes("private-menu.example.com"), `${role}: no contact values or URLs are shown to staff`);
    } else ok(!t.includes("Saved codes"), `${role}: Billing does not get the saved-codes panel`);
  }
  await browser.close();
}
process.exit(bad ? 1 : 0);
