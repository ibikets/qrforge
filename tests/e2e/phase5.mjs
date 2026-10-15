// Phase 5 in a real browser against the built app + local stand-ins (NOT real Supabase/Storage): chooser, menu, catalogue (+ product pages), event, offers, campaign.
import fs from "node:fs";
import { open, ctl, BASE, SP, sub } from "./lib.mjs";
let bad = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const OUT = `${SP}/p5`; fs.mkdirSync(OUT, { recursive: true });
const FX = (n) => `${SP}/fx/${n}`;
await ctl({ reset: true }); await ctl({ push: { subscriptions: [sub("business", 20)] } });
const { browser, context, page, logs } = await open({ width: 1280, height: 1200, signedIn: true });
const anon = await browser.newContext({ viewport: { width: 390, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
const ap = await anon.newPage(); const alogs = [];
ap.on("console", (m) => { if (m.type() === "error") alogs.push(m.text()); }); ap.on("pageerror", (e) => alogs.push("pageerror: " + e.message));
const axe = fs.readFileSync(process.env.AXE_PATH, "utf8");
const axeRes = async (pg) => { await pg.evaluate(axe); return pg.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })).violations.map((x) => x.id + ":" + x.nodes.map((n) => n.target.join(" ") + " " + (n.any[0]?.message ?? "")).join(" | "))); };
const vis = async (loc, ms = 6000) => loc.first().waitFor({ state: "visible", timeout: ms }).then(() => true, () => false);
const overflow = (pg) => pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

async function create(kindLabel, title) {
  await page.goto(BASE + "/workspace/pages/new", { waitUntil: "domcontentloaded" });
  await page.getByRole("radio", { name: new RegExp("^" + kindLabel) }).check();
  await L("Page name").fill(title);
  await page.getByRole("button", { name: "Create page" }).click();
  await page.waitForURL(/\/workspace\/pages\/[0-9a-f-]{36}$/);
  await L("Name").waitFor();
  return page.url().split("/").pop();
}
async function publish(again = false) {
  await page.getByRole("button", { name: again ? "Publish changes" : /^Publish$/ }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /^Publish/ }).click();
  await page.getByText(/Published as version \d+/).waitFor();
  return (await page.locator("a", { hasText: /\/p\/[a-z2-9]{10}$/ }).first().innerText()).split("/p/")[1];
}
const L = (t) => page.getByLabel(t, { exact: true });
const fileInputs = (sel) => page.locator(`input[type=file]${sel}`);
const addPhoto = async (n, file = "red.png") => { await fileInputs('[id*="-ph-"]').nth(n).setInputFiles(FX(file)); await page.getByRole("button", { name: "Remove photo" }).nth(n).waitFor(); };

// ============ chooser ============
await page.goto(BASE + "/workspace/pages/new", { waitUntil: "domcontentloaded" });
const KINDS = [["Digital business card", "card"], ["Business page", "business"], ["Multi-link page", "links"], ["Social profile page", "social"], ["Resume page", "resume"], ["Document page", "document"], ["Document collection", "collection"], ["Image gallery", "gallery"], ["Presentation page", "presentation"], ["Restaurant menu", "menu"], ["Product catalogue", "product"], ["Event page", "event"], ["Campaign page", "campaign"], ["Offers page", "coupon"]];
const radios = page.getByRole("radio"); await radios.first().waitFor();
ok((await radios.count()) === KINDS.length, `chooser lists all ${KINDS.length} implemented services`);
ok(await page.getByRole("radio", { name: /^Digital business card/ }).isChecked(), "the card stays the default choice");
const boxes = await page.locator("label:has(input[name=kind])").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); const svg = e.querySelector("svg"); const s = svg ? svg.getBoundingClientRect() : { width: 0 }; return { w: r.width, h: r.height, icon: s.width, text: e.innerText.trim() }; }));
ok(boxes.every((b) => b.h >= 44 && b.w >= 44), "every tile is at least 44px in both directions");
ok(boxes.every((b) => b.icon >= 24 && b.icon <= 32), "icons are 24–32px");
ok(boxes.every((b, i) => b.text === KINDS[i][0]), "tiles show only the service name (no repeated descriptions)");
ok((await page.locator("#kind-about").innerText()).includes("Save contact"), "the selected service is described once, below the grid");
await page.getByRole("radio", { name: /^Restaurant menu/ }).check();
ok(/cannot order or pay/.test(await page.locator("#kind-about").innerText()), "choosing the menu explains that ordering is not included");
await page.getByRole("radio", { name: /^Product catalogue/ }).check();
ok(/no cart, checkout, payment/.test(await page.locator("#kind-about").innerText()), "choosing the catalogue states what it does not do");
await page.getByRole("radio", { name: /^Digital business card/ }).focus();
await page.keyboard.press("ArrowRight");
ok(await page.getByRole("radio", { name: /^Business page/ }).isChecked(), "arrow keys move between tiles");
await page.screenshot({ path: `${OUT}/chooser-1280.png`, fullPage: true });
{ const v = await axeRes(page); ok(v.length === 0, "chooser: axe wcag2a/aa clean at 1280" + (v.length ? " " + JSON.stringify(v) : "")); };
await page.setViewportSize({ width: 390, height: 900 });
await page.screenshot({ path: `${OUT}/chooser-390.png`, fullPage: true });
{ const v = await axeRes(page); ok(v.length === 0 && (await overflow(page)) <= 0, "chooser: axe clean and no sideways scroll at 390" + (v.length ? " " + JSON.stringify(v) : "")); };
await page.setViewportSize({ width: 1280, height: 1200 });
const created = {};
for (const [label, kind] of KINDS) {
  created[kind] = await create(label.replace(/ \(.*/, ""), "Chooser " + kind);
  const line = await page.locator("p", { hasText: /live version|Draft, not published/ }).first().innerText();
  ok(kind === "card" ? /Digital business card|Draft/.test(line) : line.includes(label), `${label}: tile opens the ${kind} creation flow`);
}

// ============ restaurant menu ============
await ctl({ reset: true }); await ctl({ push: { subscriptions: [sub("business", 20)] } });
const mid = await create("Restaurant menu", "Mama Put menu");
await L("Name").fill("Mama Put Kitchen");
await L("Tagline (optional)").fill("Home cooking, Lagos style");
await L("Category 1 name").fill("Mains");
await L("Dish 1 in category 1 name").fill("Jollof rice");
await L("Dish 1 in category 1 price in NGN").fill("3,500");
await L("Dish 1 in category 1 description (optional)").fill("Smoky party jollof with fried plantain");
await page.getByRole("checkbox", { name: "Halal" }).first().check();
await page.getByRole("checkbox", { name: "Spicy" }).first().check();
await addPhoto(0);
ok(await page.getByRole("complementary", { name: "Live preview" }).getByRole("img", { name: "Jollof rice" }).isVisible(), "preview shows the dish photo");
await page.getByRole("button", { name: "Add dish to category 1" }).click();
await L("Dish 2 in category 1 name").fill("Egusi soup");
await L("Dish 2 in category 1 price in NGN").fill("4200");
await page.locator('select[id*="-st-"]').nth(1).selectOption("sold_out");
await page.getByRole("button", { name: "Add category" }).click();
await L("Category 2 name").fill("Drinks");
await L("Dish 1 in category 2 name").fill("Zobo");
await L("Dish 1 in category 2 price in NGN").fill("800");
await L("Dish 1 in category 2 price in NGN").blur();
const pv = page.getByRole("complementary", { name: "Live preview" });
ok(await pv.getByText("₦3,500").isVisible() && await pv.getByText("Sold out").isVisible(), "live preview formats prices and shows availability");
await page.getByRole("button", { name: "Move category 2 up" }).click();
ok((await pv.locator("h3").allInnerTexts()).join() === "Drinks,Mains", "moving a category reorders the preview");
await page.getByRole("button", { name: "Move category 1 down" }).click();
await L("Dish 1 in category 2 price in NGN").fill("eight hundred");
await page.getByRole("button", { name: "Save draft" }).click();
ok(await vis(page.getByText(/Enter the price as a number/)), "a non-numeric price is explained and not saved");
await L("Dish 1 in category 2 price in NGN").fill("800");
await page.getByRole("button", { name: "Save draft" }).click(); await page.getByText("Draft saved.").waitFor();
await page.screenshot({ path: `${OUT}/menu-editor-1280.png`, fullPage: true });
const menuPub = await publish();
await ap.goto(`${BASE}/p/${menuPub}`, { waitUntil: "domcontentloaded" });
await ap.getByRole("heading", { name: "Mama Put Kitchen", level: 1 }).waitFor();
const T = await ap.locator("body").innerText();
ok(T.includes("Jollof rice") && T.includes("₦3,500") && T.includes("₦4,200") && T.includes("₦800"), "public menu shows dishes with currency-formatted prices");
ok(T.includes("Halal") && T.includes("Spicy") && T.includes("Sold out"), "dietary labels and availability are visible as text");
ok(await ap.getByRole("navigation", { name: "Menu categories" }).getByRole("link").count() === 2, "category jump links on a long menu");
ok(await ap.getByRole("img", { name: "Jollof rice" }).evaluate((i) => i.complete && i.naturalWidth > 0), "dish photo loads from the public media route");
ok(/cannot order or pay/i.test(T) && !/add to (cart|basket)|buy now|order now|checkout/i.test(T), "no ordering or payment is implied");
ok(/opening hours/i.test(T), "opening hours section shows");
ok((await overflow(ap)) <= 0, "menu: no sideways scroll at 390");
await ap.setViewportSize({ width: 320, height: 800 });
ok((await overflow(ap)) <= 0, "menu: no sideways scroll at 320");
await ap.setViewportSize({ width: 390, height: 900 });
await ap.screenshot({ path: `${OUT}/menu-public-390.png`, fullPage: true });
{ const v = await axeRes(ap); ok(v.length === 0, "menu: axe wcag2a/aa clean" + (v.length ? " " + JSON.stringify(v) : "")); };
// draft changes stay private until republished
await L("Dish 1 in category 1 name").fill("Party jollof DRAFT");
await page.getByRole("button", { name: "Save draft" }).click(); await page.getByText("Draft saved.").waitFor();
await ap.reload({ waitUntil: "domcontentloaded" });
ok(!(await ap.locator("body").innerText()).includes("DRAFT"), "saved-but-unpublished edits are not public");
// hidden section
await L("Hide this section (keep it, but don’t show it)").first().check().catch(() => {});

// ============ product catalogue ============
const cid = await create("Product catalogue", "Ada shop");
await L("Name").fill("Ada Fashion");
await L("Category 1 name").fill("Dresses");
const prods = [["Ankara dress", "15000", "available"], ["Lace gown", "45000", "preorder"], ["Maxi dress", "12000.50", "sold_out"]];
for (let i = 0; i < prods.length; i++) {
  if (i) await page.getByRole("button", { name: "Add product to category 1" }).click();
  await L(`Product ${i + 1} in category 1 name`).fill(prods[i][0]);
  await L(`Product ${i + 1} in category 1 price in NGN`).fill(prods[i][1]);
  await page.locator('select[id*="-st-"]').nth(i).selectOption(prods[i][2]);
}
await L("Product 1 in category 1 description (optional)").fill("Hand-sewn ankara print, sizes 8 to 16.");
await addPhoto(0);
await page.getByRole("button", { name: "Add category" }).click();
await L("Category 2 name").fill("Accessories");
await L("Product 1 in category 2 name").fill("Beaded necklace");
await L("Product 1 in category 2 price in NGN").fill("3500");
await page.getByRole("button", { name: "Add product to category 2" }).click();
await L("Product 2 in category 2 name").fill("Leather bag");
await L("Product 2 in category 2 price in NGN").fill("22000");
await page.locator('select[id*="-st-"]').nth(4).selectOption("limited");
ok(!(await page.getByRole("checkbox", { name: "Halal" }).count()), "catalogue products have no dietary labels");
ok((await page.locator('select[id*="-st-"]').first().locator("option").allInnerTexts()).includes("Pre-order"), "catalogue offers a pre-order status");
await page.getByRole("button", { name: "Save draft" }).click(); await page.getByText("Draft saved.").waitFor();
await page.getByRole("button", { name: /^Publish$/ }).click();
await page.getByRole("dialog").getByRole("button", { name: /^Publish/ }).click();
ok(await vis(page.getByText(/WhatsApp number|email address/)), "publishing a catalogue without an enquiry method is refused with a clear reason");
await page.getByRole("checkbox", { name: "WhatsApp button" }).first().check();
await L("Phone number 1").fill("0801 234 5678").catch(async () => { await page.getByRole("textbox", { name: /^Phone number 1/ }).fill("+234 801 234 5678"); });
await page.getByRole("textbox", { name: /^Phone number 1/ }).fill("+234 801 234 5678");
await page.getByRole("textbox", { name: /^Email address 1/ }).fill("");
await page.screenshot({ path: `${OUT}/catalogue-editor-1280.png`, fullPage: true });
const catPub = await publish();
await ap.goto(`${BASE}/p/${catPub}`, { waitUntil: "domcontentloaded" });
await ap.getByRole("heading", { name: "Ada Fashion", level: 1 }).waitFor();
ok(await ap.getByText("5 products").isVisible(), "catalogue shows the product count");
ok(await ap.getByRole("link", { name: /Ankara dress, ₦15,000.*Open product page/ }).isVisible(), "each product is a link whose name includes price");
ok((await ap.locator("body").innerText()).includes("₦12,000.50") && (await ap.locator("body").innerText()).includes("Pre-order") && (await ap.locator("body").innerText()).includes("Sold out") && (await ap.locator("body").innerText()).includes("Limited"), "prices with decimals and availability labels show");
await ap.getByLabel("Search products").fill("bag");
ok(await ap.getByText("Showing 1 of 5 products").isVisible() && (await ap.getByRole("link", { name: /Open product page/ }).count()) === 1, "search narrows the list and says how many match");
await ap.getByLabel("Search products").fill("zzz");
ok(await ap.getByText(/No products match/).isVisible(), "no match gives a helpful message");
await ap.getByLabel("Search products").fill("");
await ap.getByRole("button", { name: "Accessories" }).click();
ok(await ap.getByRole("button", { name: "Accessories" }).getAttribute("aria-pressed") === "true" && (await ap.getByRole("link", { name: /Open product page/ }).count()) === 2, "category filter shows only that category and exposes its state");
await ap.getByRole("button", { name: "All" }).click();
ok((await overflow(ap)) <= 0, "catalogue: no sideways scroll at 390");
await ap.screenshot({ path: `${OUT}/catalogue-public-390.png`, fullPage: true });
{ const v = await axeRes(ap); ok(v.length === 0, "catalogue: axe wcag2a/aa clean" + (v.length ? " " + JSON.stringify(v) : "")); };
await ap.getByRole("link", { name: /Ankara dress/ }).click();
await ap.getByRole("heading", { name: "Ankara dress", level: 1 }).waitFor();
ok(/\/p\/[a-z2-9]{10}\/item\/[a-z0-9_-]+$/i.test(ap.url()), "a product has its own stable address");
const PT = await ap.locator("body").innerText();
ok(PT.includes("₦15,000") && PT.includes("Hand-sewn ankara print"), "product page shows price and description");
const wa = await ap.getByRole("link", { name: /on WhatsApp/ }).getAttribute("href");
ok(/^https:\/\/wa\.me\/2348012345678\?text=/.test(wa ?? "") && decodeURIComponent(wa).includes("Ankara dress") && decodeURIComponent(wa).includes("15,000"), "WhatsApp button is tied to this product (number, name and price)");
ok(await ap.getByRole("img", { name: "Ankara dress" }).evaluate((i) => i.complete && i.naturalWidth > 0), "product photo loads");
ok(!/add to (cart|basket)|buy now|pay now|order now/i.test(PT) && /nothing is bought on this page/i.test(PT), "no cart or payment is implied on the product page");
await ap.screenshot({ path: `${OUT}/product-390.png`, fullPage: true });
{ const v = await axeRes(ap); ok(v.length === 0, "product page: axe clean" + (v.length ? " " + JSON.stringify(v) : "")); };
await ap.getByRole("link", { name: /All products from Ada Fashion/ }).click();
await ap.getByRole("heading", { name: "Ada Fashion", level: 1 }).waitFor();
ok(true, "back link returns to the catalogue");
const itemUrl = (await ap.getByRole("link", { name: /Maxi dress/ }).getAttribute("href"));
await ap.goto(BASE + itemUrl, { waitUntil: "domcontentloaded" });
await ap.getByText("marked sold out").waitFor({ timeout: 8000 }).catch(() => {});
ok((await ap.locator("body").innerText()).includes("marked sold out"), "a sold-out product says so and still offers an enquiry");
await ap.goto(`${BASE}/p/${catPub}/item/nope`, { waitUntil: "domcontentloaded" });
ok(await vis(ap.getByText("This product isn’t available")), "unknown product id gives the neutral unavailable page");
await ap.goto(`${BASE}/p/${menuPub}/item/anything`, { waitUntil: "domcontentloaded" });
ok(await vis(ap.getByText("This product isn’t available")), "a menu has no product pages");
// unpublish removes product pages too
await page.getByRole("button", { name: "Unpublish" }).click();
await page.getByRole("dialog").getByRole("button", { name: "Unpublish" }).click();
await page.getByText(/Unpublished\./).waitFor();
await ap.goto(BASE + itemUrl, { waitUntil: "domcontentloaded" });
ok(await vis(ap.getByText("This product isn’t available")), "after unpublishing, product pages disappear with the catalogue");

// ============ event ============
const eid = await create("Event page", "Conference");
await L("Name").fill("Lagos Builders Summit");
await L("Starts").fill("2030-12-05T18:00");
await L("Ends (optional)").fill("2030-12-05T17:00");
await page.getByRole("button", { name: "Save draft" }).click();
ok(await vis(page.getByText("The end must be after the start.")), "an end before the start is refused");
await L("Ends (optional)").fill("2030-12-05T21:00");
await L("Button label").first().fill("Register now");
await L("Button address").first().fill("example.com/register");
await page.getByRole("textbox", { name: "Text", exact: true }).first().fill("A day of talks for people who build in Lagos.");
await page.getByRole("button", { name: "Save draft" }).click(); await page.getByText("Draft saved.").waitFor();
const evPub = await publish();
await ap.goto(`${BASE}/p/${evPub}`, { waitUntil: "domcontentloaded" });
await ap.getByRole("heading", { name: "Lagos Builders Summit", level: 1 }).waitFor();
const ET = await ap.locator("body").innerText();
ok(/5 Dec 2030, 6:00 pm/.test(ET) && /9:00 pm/.test(ET) && ET.includes("Africa/Lagos time"), "event shows start, end and the named time zone");
ok(!ET.includes("This event has ended"), "a future event is not marked ended");
ok((await ap.getByRole("link", { name: "Register now" }).getAttribute("href")) === "https://example.com/register", "registration link goes to the address provided");
await ap.screenshot({ path: `${OUT}/event-390.png`, fullPage: true });
{ const v = await axeRes(ap); ok(v.length === 0, "event: axe clean" + (v.length ? " " + JSON.stringify(v) : "")); };
await L("Starts").fill("2024-01-10T10:00"); await L("Ends (optional)").fill("2024-01-10T12:00");
await publish(true);
await ap.goto(`${BASE}/p/${evPub}`, { waitUntil: "domcontentloaded" });
await ap.getByRole("heading", { name: "Lagos Builders Summit", level: 1 }).waitFor();
ok((await ap.locator("body").innerText()).includes("This event has ended"), "a past event says it has ended");

// ============ offers ============
const oid = await create("Offers page", "Weekend offers");
await L("Name").fill("Ada Fashion offers");
await L("Offer title").fill("10% off all dresses");
await L("Code (optional)").fill("SAVE 10");
await page.getByRole("button", { name: "Save draft" }).click();
ok(await vis(page.getByText(/Use 2 to 32 letters, numbers, dashes or underscores/)), "a code with a space is refused");
await L("Code (optional)").fill("SAVE10");
await L("Last day (optional)").fill("2030-12-31");
await L("Conditions (optional)").fill("One use per customer. In store only.");
await L("Add a section").selectOption("offer");
await page.getByRole("button", { name: "Add section" }).click();
const offerTitles = L("Offer title");
await offerTitles.nth(1).fill("Old promo");
await L("Code (optional)").nth(1).fill("OLD1");
await L("Last day (optional)").nth(1).fill("2020-01-31");
await page.getByRole("button", { name: "Save draft" }).click(); await page.getByText("Draft saved.").waitFor();
const ofPub = await publish();
await ap.goto(`${BASE}/p/${ofPub}`, { waitUntil: "domcontentloaded" });
await ap.getByRole("heading", { name: "Ada Fashion offers", level: 1 }).waitFor();
const OT = await ap.locator("body").innerText();
ok(OT.includes("Valid now") && OT.includes("SAVE10") && /Valid until \w+, 31 Dec 2030/.test(OT), "an active offer shows its code and validity");
ok(OT.includes("Expired") && !OT.includes("OLD1"), "an expired offer is labelled and its code is not shown");
ok(OT.includes("One use per customer") && /does not check or apply codes/.test(OT), "conditions and the display-only note are shown");
await ap.getByRole("button", { name: "Copy code" }).click();
ok(await vis(ap.getByRole("button", { name: "Copied" })), "Copy code confirms with a visible 'Copied' state");
const clip = await ap.evaluate(() => navigator.clipboard.readText()).catch((e) => "ERR " + e.message);
ok(clip === "SAVE10", "Copy code puts the code on the clipboard (" + clip + ")");
ok(!/add to (cart|basket)|redeem|claim/i.test(OT), "no redemption is implied");
await ap.screenshot({ path: `${OUT}/offers-390.png`, fullPage: true });
{ const v = await axeRes(ap); ok(v.length === 0, "offers: axe clean" + (v.length ? " " + JSON.stringify(v) : "")); };

// ============ campaign ============
const gid = await create("Campaign page", "Black Friday");
await L("Name").fill("Black Friday at Ada Fashion");
await L("Tagline (optional)").fill("Everything up to 40% off");
await fileInputs("#hdr-cover").setInputFiles(FX("red.png"));
await page.getByRole("button", { name: "Remove cover" }).waitFor();
await page.getByRole("textbox", { name: "Text", exact: true }).first().fill("Three days only. Visit the shop or message us.");
await L("Button label").first().fill("Shop the sale");
await L("Button address").first().fill("example.com/sale");
const cmPub = await publish();
await ap.goto(`${BASE}/p/${cmPub}`, { waitUntil: "domcontentloaded" });
await ap.getByRole("heading", { name: "Black Friday at Ada Fashion", level: 1 }).waitFor();
ok(await ap.getByRole("link", { name: "Shop the sale" }).isVisible() && (await ap.locator("article img").first().evaluate((i) => i.complete && i.naturalWidth > 0)), "campaign shows its cover and one clear button");
{ const v = await axeRes(ap); ok(v.length === 0 && (await overflow(ap)) <= 0, "campaign: axe clean, no sideways scroll" + (v.length ? " " + JSON.stringify(v) : "")); };

const real = [...logs, ...alogs].filter((l) => !/status of 422/.test(l)); // 422s are the deliberate invalid saves above
ok(real.length === 0, "no unexpected browser console errors" + (real.length ? " " + JSON.stringify(real.slice(0, 3)) : ""));
await browser.close();
if (bad) { console.log(`\n${bad} FAILED`); process.exit(1); } else console.log("\nall passed");
