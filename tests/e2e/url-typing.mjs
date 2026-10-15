// Website / social fields in the hosted card editor (and the static contact editor): typing and pasting must never crash,
// invalid input is explained inline, nothing the person typed is lost, and only finished, safe links reach the preview, the public page and the contact file.
import { open, ctl, BASE, sub } from "./lib.mjs";
let bad = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
await ctl({ reset: true }); await ctl({ push: { subscriptions: [sub("pro", 20)] } });
const { browser, page, logs } = await open({ width: 1440, height: 1100, signedIn: true });
const crashed = async () => (await page.getByText("We couldn’t load this page").count()) > 0;
await page.goto(BASE + "/workspace/pages/new", { waitUntil: "load" });
await page.getByLabel("Page name").fill("Typing test");
await page.getByRole("button", { name: "Create page" }).click();
await page.waitForURL(/\/workspace\/pages\/[0-9a-f-]{36}$/);
const pageId = page.url().split("/").pop();
await page.getByLabel("Name", { exact: true }).waitFor();
await page.getByLabel("Name", { exact: true }).fill("Ada Obi");
await page.getByLabel("Job title").fill("Head of Product");
await page.getByLabel("Phone number 1", { exact: true }).fill("0803 123 4567");
const preview = page.getByRole("complementary", { name: "Live preview" });
const site = page.getByLabel("Website 1", { exact: true });
const webLink = preview.getByRole("link", { name: "Website", exact: true });

// 1. character by character, including every awkward intermediate value
await site.click();
const target = "https://example.com/path?x=1&y=2#frag";
let crashAt = null; const seen = [];
for (let i = 1; i <= target.length && crashAt === null; i++) {
  await page.keyboard.type(target[i - 1]);
  if (await crashed()) crashAt = target.slice(0, i);
  seen.push(target.slice(0, i));
}
ok(crashAt === null, crashAt === null ? `typing "${target}" one character at a time never crashes (${seen.length} states, including "h", "https:", "https://")` : `CRASH after typing: "${crashAt}"`);
ok((await site.inputValue()) === target, "the field holds exactly what was typed");
ok(await webLink.getAttribute("href") === "https://example.com/path?x=1&y=2#frag", "preview shows the finished address, query and fragment intact");
ok((await page.locator("#websites-0-err").count()) === 0, "no error is shown for a finished address");

// 2. unfinished values: no crash, no link, no nagging while typing, a clear message once the person leaves the field
await site.fill("");
for (const v of ["h", "https:", "https://", "example"]) {
  await site.fill(v);
  ok(!(await crashed()), `"${v}": editor stays up`);
  ok((await webLink.count()) === 0, `"${v}": preview offers no link`);
  ok((await page.locator("#websites-0-err").count()) === 0, `"${v}": no error while still typing`);
}
await page.getByLabel("Job title").focus(); // leave the field
await page.locator("#websites-0-err").waitFor();
ok(/website address such as example\.com/i.test(await page.locator("#websites-0-err").innerText()) && (await site.getAttribute("aria-invalid")) === "true", "after leaving the field the problem is explained inline and flagged for assistive technology");
ok((await site.inputValue()) === "example", "the unfinished text is kept as typed");
await site.fill("example.com");
ok((await page.locator("#websites-0-err").count()) === 0 && await webLink.getAttribute("href") === "https://example.com/", "fixing it clears the message and shows https://example.com/");

// 3. unsafe and malformed pastes
for (const v of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "mailto:a@b.co", "ftp://example.com", "https://exa mple.com", "https://user:pw@example.com"]) {
  await site.fill(v);
  ok(!(await crashed()) && (await webLink.count()) === 0, `pasted ${JSON.stringify(v.slice(0, 28))}: no crash, no clickable link`);
}
await page.getByLabel("Job title").focus();
ok((await page.locator("#websites-0-err").count()) === 1, "unsafe/malformed values are explained inline");
ok((await preview.locator("a[href^='javascript:'], a[href^='data:'], a[href^='ftp:']").count()) === 0, "no unsafe href anywhere in the preview");
// save is refused by the server with the same rule, and nothing typed is lost
await page.getByRole("button", { name: "Save draft" }).click();
await page.getByText("Fix the highlighted fields.").first().waitFor();
ok((await site.inputValue()) === "https://user:pw@example.com" && (await page.getByLabel("Name", { exact: true }).inputValue()) === "Ada Obi" && (await page.getByLabel("Phone number 1", { exact: true }).inputValue()) === "0803 123 4567", "after the refused save every field still holds what was entered");
const bad1 = await page.evaluate(async (id) => (await fetch(`/api/pages/${id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "x", expectedVersion: 1, card: { name: "A", websites: [{ id: "w1", label: "", value: "javascript:alert(1)", public: true }] } }) })).status, pageId);
ok(bad1 === 400 || bad1 === 422, `the server refuses a javascript: address itself (HTTP ${bad1})`);

// 4. several website and social rows: add, edit, remove, order
await site.fill("example.com");
await page.getByRole("button", { name: "Add website" }).click();
await page.getByLabel("Website 2", { exact: true }).fill("shop.example.org/menu?lang=en");
await page.getByRole("button", { name: "Add website" }).click();
await page.getByLabel("Website 3", { exact: true }).pressSequentially("htt");
ok(!(await crashed()), "a third, half-typed website row does not crash the editor");
await page.getByLabel("Website 3", { exact: true }).fill("blog.example.net");
await page.getByRole("button", { name: "Remove website 2" }).click();
ok((await page.getByLabel("Website 2", { exact: true }).inputValue()) === "blog.example.net", "removing the middle row keeps the others in order");
await page.getByRole("button", { name: "Add social profile" }).click();
await page.getByLabel("Social profile 1 type").selectOption("other");
const soc = page.getByLabel("Social profile 1", { exact: true });
await soc.click(); await page.keyboard.type("https://");
ok(!(await crashed()), "a half-typed 'other' social link does not crash");
await soc.fill("https://example.social/ada");
await page.getByRole("button", { name: "Add social profile" }).click();
await page.getByLabel("Social profile 2 type").selectOption("instagram");
await page.getByLabel("Social profile 2", { exact: true }).pressSequentially("@ada.obi");
ok(!(await crashed()), "typing a social handle character by character does not crash");

// 5. save, reload, values survive exactly as typed
await page.getByRole("button", { name: "Save draft" }).click();
await page.getByText("Draft saved.").waitFor();
await page.reload({ waitUntil: "load" });
await page.getByLabel("Website 1", { exact: true }).waitFor();
const vals = async () => ({ w1: await page.getByLabel("Website 1", { exact: true }).inputValue(), w2: await page.getByLabel("Website 2", { exact: true }).inputValue(), s1: await page.getByLabel("Social profile 1", { exact: true }).inputValue(), s2: await page.getByLabel("Social profile 2", { exact: true }).inputValue() });
const v = await vals();
ok(v.w1 === "example.com" && v.w2 === "blog.example.net" && v.s1 === "https://example.social/ada" && v.s2 === "@ada.obi", "after reload the saved rows come back exactly as entered");
ok((await page.getByLabel("Website 3", { exact: true }).count()) === 0, "the removed row stays removed");
ok(await preview.getByRole("link", { name: "Website", exact: true }).getAttribute("href") === "https://example.com/", "preview after reload uses the first valid website");

// 6. publish; a signed-out visitor sees only finished, safe links; the contact file carries the same
await page.getByRole("button", { name: "Publish", exact: true }).click();
await page.getByRole("dialog").getByRole("button", { name: "Publish", exact: true }).click();
await page.getByText(/Published as version 1/).waitFor();
const publicId = (await page.locator("a", { hasText: /\/p\/[a-z2-9]{10}$/ }).first().innerText()).split("/p/")[1];
const anon = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
const ap = await anon.newPage();
await ap.goto(`${BASE}/p/${publicId}`, { waitUntil: "load" });
await ap.getByRole("heading", { name: "Ada Obi" }).waitFor();
const hrefs = await ap.locator("section[aria-label='Websites'] a").evaluateAll((a) => a.map((x) => x.getAttribute("href")));
ok(JSON.stringify(hrefs) === JSON.stringify(["https://example.com/", "https://blog.example.net/"]), `public page lists the two websites as https links ${JSON.stringify(hrefs)}`);
ok(await ap.locator("section[aria-label='Social'] a").evaluateAll((a) => a.map((x) => x.getAttribute("href"))).then((h) => h.includes("https://example.social/ada") && h.includes("https://instagram.com/ada.obi") || h.some((x) => /instagram\.com\/ada\.obi/.test(x))), "public page lists both social links");
const vcf = await (await anon.request.get(`${BASE}/p/${publicId}/contact.vcf`)).text();
ok(vcf.includes("URL:https://example.com/") && vcf.includes("URL:https://blog.example.net/") && !/URL:.*(javascript|data:)/i.test(vcf), "the downloaded contact file has the same published websites");

// 7. static contact editor (Create): typing a website one character at a time
await page.goto(BASE + "/create", { waitUntil: "load" });
await page.getByLabel("Type", { exact: true }).selectOption("vcard");
await page.getByLabel("First name").fill("Ada");
const w = page.getByLabel("Website 1", { exact: true });
await w.click();
let crash2 = null;
for (const [i, ch] of [..."https://example.com/a?b=1#c"].entries()) { await page.keyboard.type(ch); if ((await page.getByText("We couldn’t load this page").count()) > 0) { crash2 = i; break; } }
ok(crash2 === null, "static contact editor: typing a website one character at a time does not crash");
ok(!logs.some((l) => /TypeError|Cannot read properties/.test(l)), "no TypeError in the browser console during the whole run");
console.log(logs.filter((l) => !/Failed to load resource/.test(l)).slice(0, 3).join("\n"));
await browser.close(); console.log(bad ? `${bad} FAILED` : "all passed"); process.exit(bad ? 1 : 0);
