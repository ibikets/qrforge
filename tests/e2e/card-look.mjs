// Visual review of the published digital card + editor preview: screenshots at 320/390/1280, axe contrast, keyboard reach, action targets.
// usage: node card-look.mjs <tag>   (tag names the screenshot set, e.g. before / after)
import fs from "node:fs";
import { open, ctl, BASE, SP, sub } from "./lib.mjs";
const tag = process.argv[2] ?? "after";
let bad = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const OUT = `${SP}/look`; fs.mkdirSync(OUT, { recursive: true });
await ctl({ reset: true }); await ctl({ push: { subscriptions: [sub("business", 20)] } });
const { browser, page } = await open({ width: 1280, height: 1000, signedIn: true });
const call = (path, method, body) => page.evaluate(async ([p, m, b]) => { const r = await fetch(p, { method: m, headers: { "content-type": "application/json" }, body: JSON.stringify(b) }); return { status: r.status, j: await r.json().catch(() => ({})) }; }, [path, method, body]);
const upload = (pid, name, kind) => page.evaluate(async ([id, b64, k]) => { const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); const fd = new FormData(); fd.set("file", new File([bytes], "x.png", { type: "image/png" })); fd.set("kind", k); const r = await fetch(`/api/pages/${id}/media`, { method: "POST", body: fd }); return r.json(); }, [pid, fs.readFileSync(`${SP}/fx/${name}`).toString("base64"), kind]);
const row = (id, label, value, extra = {}) => ({ id, label, value, public: true, ...extra });
const scenarios = {
  rich: { accent: "clay", photo: true, logo: true, card: { name: "Adaeze Chukwuemeka-Oyelaran", role: "Head of Partnerships and Business Development", company: "Bitzpark Limited", intro: "I help growing African businesses turn introductions into lasting partnerships. Say hello any time.",
    phones: [row("p1", "mobile", "+234 803 123 4567", { whatsapp: true }), row("p2", "work", "0701 234 5678")], emails: [row("e1", "work", "ada@bitzpark.com"), row("e2", "home", "adaeze.personal@example.com")], websites: [row("w1", "", "bitzpark.com"), row("w2", "", "blog.bitzpark.com/ada")],
    socials: ["github", "instagram", "linkedin", "x", "youtube", "facebook", "tiktok"].map((k, i) => row("s" + i, k, "ada.o")) } },
  plain: { accent: "sky", photo: false, logo: false, card: { name: "Supercalifragilisticexpialidocious-Okonkwo", role: "", company: "", intro: "", phones: [row("p1", "mobile", "0803 123 4567")], emails: [], websites: [], socials: [] } },
  ink: { accent: "ink", photo: true, logo: false, card: { name: "Tunde Bello", role: "Architect", company: "", intro: "Residential and commercial design in Lagos.", phones: [row("p1", "mobile", "+234 803 123 4567", { whatsapp: true })], emails: [row("e1", "work", "tunde@example.com")], websites: [row("w1", "", "tundebello.com")], socials: [row("s1", "linkedin", "tunde-bello"), row("s2", "github", "tbello")] } },
  forest: { accent: "forest", photo: false, logo: true, card: { name: "Chioma Eze", role: "Founder", company: "Eze Foods", intro: "Fresh, local, delivered.", phones: [row("p1", "mobile", "0803 123 4567")], emails: [row("e1", "work", "hi@ezefoods.ng")], websites: [row("w1", "", "ezefoods.ng")], socials: [row("s1", "instagram", "ezefoods"), row("s2", "youtube", "ezefoods")] } },
};
const ids = {};
for (const [k, sc] of Object.entries(scenarios)) {
  await page.goto(BASE + "/workspace/pages/new", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Page name").fill(k);
  await page.getByRole("button", { name: "Create page" }).click();
  await page.waitForURL(/\/workspace\/pages\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").pop();
  const portraitId = sc.photo ? (await upload(id, "red.png", "portrait")).id : null, logoId = sc.logo ? (await upload(id, "blue.jpg", "logo")).id : null;
  const r = await call(`/api/pages/${id}`, "PUT", { title: k, expectedVersion: 1, card: { ...sc.card, accent: sc.accent, portraitId, logoId, role: sc.card.role, company: sc.card.company } });
  ok(r.status === 200, `${k}: saved (${r.status}) ${r.status === 200 ? "" : JSON.stringify(r.j).slice(0, 300)}`);
  const p = await call(`/api/pages/${id}/publish`, "POST", { expectedVersion: r.j.version });
  ok(p.status === 200, `${k}: published`);
  ids[k] = { id, publicId: (await (await page.request.get(`${BASE}/api/pages/${id}`)).json().catch(() => ({}))).public_id };
}
// public ids from the list page links
await page.goto(BASE + "/workspace/pages", { waitUntil: "domcontentloaded" });
const anon = await browser.newContext({ viewport: { width: 390, height: 900 } });
const ap = await anon.newPage();
const axe = fs.readFileSync(process.env.AXE_PATH, "utf8");
for (const [k, v] of Object.entries(ids)) {
  await page.goto(`${BASE}/workspace/pages/${v.id}`, { waitUntil: "domcontentloaded" });
  const pub = (await page.locator("a", { hasText: /\/p\/[a-z2-9]{10}$/ }).first().innerText()).split("/p/")[1]; v.publicId = pub;
  for (const w of [320, 390, 1280]) {
    await ap.setViewportSize({ width: w, height: 1000 });
    await ap.goto(`${BASE}/p/${pub}`, { waitUntil: "domcontentloaded" });
    await ap.getByRole("heading", { level: 1 }).waitFor(); await ap.waitForTimeout(300);
    await ap.screenshot({ path: `${OUT}/${tag}-${k}-${w}.png`, fullPage: true });
    ok(await ap.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${k}@${w}: no horizontal scroll`);
    if (w === 390) {
      await ap.evaluate(axe);
      const res = await ap.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })).violations.map((x) => x.id + ":" + x.nodes.length));
      ok(res.length === 0, `${k}@390: axe wcag2a/aa clean ${JSON.stringify(res)}`);
      const small = await ap.evaluate(() => [...document.querySelectorAll("article a, article button")].filter((e) => { const r = e.getBoundingClientRect(); return r.width && (r.width < 44 || r.height < 44); }).map((e) => e.getAttribute("aria-label") || e.textContent?.trim()));
      ok(small.length === 0, `${k}@390: every link/button is at least 44x44 ${JSON.stringify(small)}`);
    }
  }
}
// editor preview (unpublished-state Save contact) at desktop and phone width
for (const w of [1280, 390]) {
  await page.setViewportSize({ width: w, height: 1000 });
  await page.goto(`${BASE}/workspace/pages/${ids.rich.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("complementary", { name: "Live preview" }).waitFor();
  await page.waitForTimeout(400);
  await page.getByRole("complementary", { name: "Live preview" }).screenshot({ path: `${OUT}/${tag}-editor-preview-${w}.png` });
}
// new unpublished card: Save contact must look unavailable
await page.setViewportSize({ width: 1280, height: 1000 });
await page.goto(BASE + "/workspace/pages/new", { waitUntil: "domcontentloaded" });
await page.getByLabel("Page name").fill("Draft only");
await page.getByRole("button", { name: "Create page" }).click();
await page.waitForURL(/\/workspace\/pages\/[0-9a-f-]{36}$/);
await page.getByLabel("Name", { exact: true }).fill("Draft Person"); await page.getByLabel("Phone number 1", { exact: true }).fill("0803 123 4567");
const prev = page.getByRole("complementary", { name: "Live preview" });
await prev.getByText("Preview only").waitFor();
await prev.screenshot({ path: `${OUT}/${tag}-editor-draft.png` });
ok((await prev.getByRole("link", { name: /Save contact/ }).count()) === 0, "editor preview: Save contact is not a link");
// keyboard reach on published rich card
await ap.setViewportSize({ width: 390, height: 900 });
await ap.goto(`${BASE}/p/${ids.rich.publicId}`, { waitUntil: "domcontentloaded" });
let seen = new Set(); for (let i = 0; i < 90; i++) { await ap.keyboard.press("Tab"); seen.add(await ap.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "")); }
ok([...seen].some((s) => /^Save contact/.test(s)) && [...seen].some((s) => /^Instagram/.test(s)) && [...seen].some((s) => /^Call:/.test(s)), "keyboard Tab reaches Call, Save contact and social links");
await browser.close(); console.log(bad ? `${bad} FAILED` : "all passed"); process.exit(bad ? 1 : 0);
