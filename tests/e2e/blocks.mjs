// Business / multi-link / social pages end to end in a real browser against the built app + local stand-ins (NOT real Supabase).
import { open, ctl, BASE, sub, actionHref } from "./lib.mjs";
let bad = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
await ctl({ reset: true });
await ctl({ push: { subscriptions: [sub("pro", 20)] } });
const { browser, page, logs } = await open({ width: 1440, height: 1100, signedIn: true });
const api = (path, init) => page.evaluate(async ([p, i]) => { const r = await fetch(p, i); return { status: r.status, j: await r.json().catch(() => ({})) }; }, [path, init]);
const apiJson = (path, method, body) => api(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function create(kindLabel, title) {
  await page.goto(BASE + "/workspace/pages/new", { waitUntil: "domcontentloaded" });
  await page.getByRole("radio", { name: new RegExp("^" + kindLabel) }).check();
  await page.getByLabel("Page name").fill(title);
  await page.getByRole("button", { name: "Create page" }).click();
  await page.waitForURL(/\/workspace\/pages\/[0-9a-f-]{36}$/);
  await page.getByLabel("Name", { exact: true }).waitFor();
  return page.url().split("/").pop();
}

// ---------- chooser ----------
await page.goto(BASE + "/workspace/pages/new", { waitUntil: "networkidle" });
for (const l of ["Digital business card", "Business page", "Multi-link page", "Social profile page"]) ok(await page.getByRole("radio", { name: new RegExp("^" + l) }).isVisible(), `chooser offers ${l}`);
ok(await page.getByRole("radio", { name: /^Digital business card/ }).isChecked(), "card is the default choice");

// ---------- business page ----------
const bid = await create("Business page", "Acme main");
ok(true, "business page created");
await page.getByLabel("Name", { exact: true }).fill("Acme Ltd");
await page.getByLabel("Tagline (optional)").fill("We fix things");
await page.getByLabel("Phone number 1", { exact: true }).fill("+234 803 123 4567");
await page.getByLabel("Phone number 1", { exact: true }).blur();
await page.getByLabel("WhatsApp button").first().check();
await page.getByLabel("Email address 1", { exact: true }).fill("hello@acme.ng");
await page.getByLabel("Website 1", { exact: true }).fill("acme.ng");
// private number must never be public
await page.getByRole("button", { name: "Add phone number" }).click();
await page.getByLabel("Phone number 2", { exact: true }).fill("+234 801 000 0000");
await page.getByLabel("Show on the page").nth(1).uncheck();
await page.getByRole("textbox", { name: "Address", exact: true }).fill("12 Marina Road, Lagos");
// inline validation: bad email only judged after leaving the field
await page.getByLabel("Email address 1", { exact: true }).fill("not-an-email");
await page.getByLabel("Email address 1", { exact: true }).blur();
ok((await page.locator("[aria-invalid=true]").count()) >= 1, "bad email flagged on leaving the field");
await page.getByLabel("Email address 1", { exact: true }).fill("hello@acme.ng");
// preview shows finished input only
const prev = page.getByRole("complementary", { name: "Live preview" });
ok(await prev.getByText("Acme Ltd").first().isVisible() && await prev.getByRole("link", { name: /^Call:/ }).isVisible() && await prev.getByRole("link", { name: "Get directions" }).isVisible(), "preview shows name, Call and directions");
ok(!(await prev.getByText("0801").count()), "preview omits the private number");
// hours
await page.getByLabel("Monday opens").fill("08:30");
await page.getByLabel("Monday closes").fill("18:00");
ok(await prev.getByText("08:30 – 18:00").isVisible(), "preview shows the opening hours");
// reorder: move Location above Opening hours
const hoursUp = page.getByRole("button", { name: "Move Location section up" });
await hoursUp.click();
const heads = await page.locator("section[aria-labelledby^=sec-] h2").allInnerTexts();
ok(heads.indexOf("Location") < heads.indexOf("Opening hours"), "section moved up");
ok((await prev.locator("section").evaluateAll((e) => e.map((x) => x.getAttribute("aria-label") ?? x.querySelector("h2")?.textContent))).join("|").indexOf("Find us") < (await prev.locator("section").evaluateAll((e) => e.map((x) => x.getAttribute("aria-label") ?? x.querySelector("h2")?.textContent))).join("|").indexOf("Opening hours"), "preview follows the new order");
// hide / remove / add
await page.getByLabel("Hide this section").last().check();
await page.getByRole("button", { name: "Save draft" }).click();
await page.getByText("Draft saved.").waitFor();
ok(true, "draft saved");
await page.getByLabel("Hide this section").last().uncheck();
// publish
await page.getByRole("button", { name: "Publish", exact: true }).click();
await page.getByRole("button", { name: "Publish", exact: true }).last().click();
await page.getByText(/Published as version 1/).waitFor();
ok(true, "business page published");
const pubUrl = await page.locator("a[href^='http'][href*='/p/']").first().getAttribute("href");
const pid = pubUrl.split("/p/")[1];
const anon = await (await browser.newContext({ viewport: { width: 390, height: 900 } })).newPage();
await anon.goto(`${BASE}/p/${pid}`, { waitUntil: "networkidle" });
ok(await anon.getByRole("heading", { name: "Acme Ltd", level: 1 }).isVisible(), "public: name");
ok(await actionHref(anon, "Call") === "tel:+2348031234567", "public: Call link");
ok(await actionHref(anon, "WhatsApp") === "https://wa.me/2348031234567", "public: WhatsApp link");
ok((await anon.getByRole("link", { name: "Get directions" }).getAttribute("href")).startsWith("https://www.google.com/maps/search/?api=1&query="), "public: directions link");
ok(!(await anon.content()).includes("801 000"), "public: private number absent from the page");
ok(await anon.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "public @390: no horizontal scroll");
const vcf = await anon.request.get(`${BASE}/p/${pid}/contact.vcf`);
const vtext = await vcf.text();
ok(vcf.status() === 200 && vtext.includes("FN:Acme Ltd") && vtext.includes("X-ABShowAs:COMPANY") && vtext.includes("ADR;TYPE=WORK:") && !vtext.includes("801") && !vtext.includes("PHOTO"), "contact file: organisation, address, no private number, no photo");
ok((vcf.headers()["x-content-type-options"] ?? "") === "nosniff", "contact file served with nosniff");

// edits after publish do not leak until published
await page.getByLabel("Tagline (optional)").fill("DRAFT ONLY WORDS");
await page.getByRole("button", { name: "Save draft" }).click();
await page.getByText("Draft saved.").waitFor();
await anon.reload({ waitUntil: "networkidle" });
ok(!(await anon.content()).includes("DRAFT ONLY WORDS"), "unpublished edits are not public");
// restore keeps public details only
const rest = await apiJson(`/api/pages/${bid}/restore`, "POST", { version: 1, expectedVersion: 0 });
ok(rest.status === 409, "restore with a stale version is refused");

// ---------- links page ----------
const lid = await create("Multi-link page", "Ada links");
await page.getByLabel("Name", { exact: true }).fill("Ada");
await page.getByLabel("Link 1 label").fill("Shop");
await page.getByLabel("Link 1 address").fill("javascript:alert(1)");
await page.getByLabel("Link 1 address").blur();
ok((await page.locator("[aria-invalid=true]").count()) >= 1, "javascript: address flagged");
await page.getByLabel("Link 1 address").fill("shop.example.com");
await page.getByRole("button", { name: "Add link" }).click();
await page.getByLabel("Link 2 label").fill("Blog");
await page.getByLabel("Link 2 address").fill("blog.example.com");
await page.getByRole("button", { name: "Move link 2 up" }).click();
const lprev = page.getByRole("complementary", { name: "Live preview" });
const order = await lprev.locator("ul li a").allInnerTexts();
ok(order[0]?.startsWith("Blog") && order[1]?.startsWith("Shop"), "links reordered in the preview");
// publish needs a social/links content; page should publish
await page.getByRole("button", { name: "Publish", exact: true }).click();
await page.getByRole("button", { name: "Publish", exact: true }).last().click();
await page.getByText(/Published as version 1/).waitFor();
const lpid = (await page.locator("a[href^='http'][href*='/p/']").first().getAttribute("href")).split("/p/")[1];
await anon.goto(`${BASE}/p/${lpid}`, { waitUntil: "networkidle" });
const pubLinks = await anon.locator("main a, article a").evaluateAll((a) => a.map((x) => x.getAttribute("href")).filter((h) => /example\.com/.test(h)));
ok(pubLinks[0] === "https://blog.example.com/" && pubLinks[1] === "https://shop.example.com/", "public links in the chosen order, normalised");
ok((await anon.request.get(`${BASE}/p/${lpid}/contact.vcf`)).status() === 404, "links page has no contact file");

// ---------- social page ----------
const sid = await create("Social profile page", "Ada socials");
await page.getByLabel("Name", { exact: true }).fill("Ada O.");
await page.getByLabel("Social profile 1", { exact: true }).fill("@ada.o");
await page.getByRole("button", { name: "Add social profile" }).click();
await page.getByLabel("Social profile 2", { exact: true }).fill("ada.o");
await page.getByLabel("Social profile 2", { exact: true }).blur();
ok(await page.getByText(/repeats entry 1/).first().isVisible(), "duplicate profile reported next to the field once it is left");
await page.getByRole("button", { name: "Remove social profile 2" }).click();
await page.getByRole("button", { name: "Publish", exact: true }).click();
await page.getByRole("button", { name: "Publish", exact: true }).last().click();
await page.getByText(/Published as version 1/).waitFor();
ok(true, "social page published");

// ---------- server-side rules ----------
ok((await apiJson("/api/pages", "POST", { title: "x", kind: "bogus" })).status === 422, "unknown kind refused");
ok((await apiJson("/api/pages", "POST", { title: "x", kind: "__proto__" })).status === 422, "odd kind refused");
const get = await apiJson(`/api/pages/${bid}`, "PUT", { title: "Acme main", content: { blocks: [{ type: "header", name: "x" }, { type: "hours" }, { type: "evil" }] }, expectedVersion: 99 });
ok(get.status === 409, "stale save refused");
const pub = await apiJson(`/api/pages/${sid}/publish`, "POST", { expectedVersion: 0 });
ok(pub.status === 409 || pub.status === 422, "publish with stale version refused");
// admin list shows the kind; public id for a draft-only page is neutral
const d = await create("Business page", "Draft only");
const draftPid = (await page.locator("a[href^='http'][href*='/p/']").first().getAttribute("href")).split("/p/")[1];
await anon.goto(`${BASE}/p/${draftPid}`, { waitUntil: "networkidle" });
ok(await anon.getByText("This page isn’t available").isVisible(), "never-published page is neutral");
await page.goto(BASE + "/workspace/pages", { waitUntil: "networkidle" });
ok(await page.getByText("Business page ·").first().isVisible() && await page.getByText("Multi-link page ·").first().isVisible() && await page.getByText("Social profile page ·").first().isVisible(), "list shows each page's type");

// ---------- a11y quick checks ----------
await page.goto(`${BASE}/workspace/pages/${bid}`, { waitUntil: "networkidle" });
const unlabeled = await page.evaluate(() => [...document.querySelectorAll("input,select,textarea")].filter((e) => e.offsetParent !== null && !((e.id && document.querySelector(`label[for="${e.id}"]`)) || e.getAttribute("aria-label") || e.closest("label"))).length);
ok(unlabeled === 0, "every editor control has a label");
ok(logs.filter((l) => !/Failed to load resource/.test(l)).length === 0, "no console errors or page errors: " + logs.slice(0, 3).join(" | "));
await browser.close();
console.log(bad ? `\n${bad} FAILED` : "\nall passed");
process.exit(bad ? 1 : 0);
