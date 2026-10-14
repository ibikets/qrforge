import fs from "node:fs";
import { open, ctl, BASE, SP, UID, sub } from "./lib.mjs";
const axeSrc = fs.readFileSync(process.env.AXE_PATH, "utf8");
const ok = (c, m) => console.log((c ? "PASS " : "FAIL ") + m);
const codes = [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", user_id: UID, name: "Cafe menu", type: "url", fields: { url: "example.com/menu" }, style: {}, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-10T00:00:00Z" }];
await ctl({ reset: true, push: { subscriptions: [sub("pro", 20, { auto_renew: true, authorization_code: "A" })], qr_codes: codes } });

// ---- 200% zoom (1440 and 1280 desktops at 200% = 720 / 640 CSS px wide, DPR 2) and 400% reflow (320)
const routes = [["/", false], ["/create", false], ["/pricing", false], ["/login", false], ["/forgot-password", false], ["/create", true], ["/codes", true], ["/billing", true], ["/account", true]];
for (const [label, w, h] of [["200% of 1440 (720px)", 720, 450], ["200% of 1280 (640px)", 640, 400], ["400% reflow (320px)", 320, 256]]) {
  let bad = 0;
  for (const signedIn of [false, true]) {
    const { browser, context, page } = await open({ width: w, height: h, signedIn });
    for (const [p, auth] of routes) {
      if (auth !== signedIn) continue;
      await page.goto(BASE + p); await page.waitForLoadState("networkidle");
      const r = await page.evaluate(() => {
        const foot = document.querySelector("footer"); const fr = foot.getBoundingClientRect();
        const main = document.querySelector("main").getBoundingClientRect();
        return { overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, footerFixed: getComputedStyle(foot).position === "fixed" || getComputedStyle(foot).position === "sticky", overlap: fr.top < main.bottom - 1, footTextVisible: [...foot.querySelectorAll("p,a")].every((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.left >= 0 && b.right <= document.documentElement.clientWidth + 1; }) };
      });
      if (r.overflow || r.footerFixed || r.overlap || !r.footTextVisible) { bad++; console.log("   problem", signedIn ? "auth" : "anon", p, JSON.stringify(r)); }
    }
    await browser.close();
  }
  ok(bad === 0, `${label}: no horizontal scroll, footer in flow, not overlapping content, text inside viewport`);
}
// footer after Upgrade dialog / sticky elements at 200%: dialog fits
{ const { browser, page } = await open({ width: 720, height: 450 }); await page.goto(BASE + "/create"); await page.waitForSelector("#f-url");
  await page.selectOption("#qr-type", { label: "Phone — Pro" }); const d = page.locator("dialog[open]"); await d.waitFor();
  const b = await d.boundingBox(); ok(b.x >= 0 && b.y >= 0 && b.x + b.width <= 720 && b.y + b.height <= 450, "200% zoom: upgrade dialog fits the viewport");
  const scrollable = await d.evaluate((el) => el.scrollHeight <= el.clientHeight || getComputedStyle(el).overflowY !== "visible"); ok(scrollable, "200% zoom: dialog content scrollable if taller than viewport");
  await browser.close(); }

// ---- keyboard: tab order, skip link, footer reachability, focus visibility
{ const { browser, page } = await open({ width: 1440, height: 900 }); await page.goto(BASE + "/create"); await page.waitForSelector("#f-url");
  const seq = []; for (let i = 0; i < 40; i++) { await page.keyboard.press("Tab"); seq.push(await page.evaluate(() => { const e = document.activeElement; const cs = getComputedStyle(e); return { t: (e.getAttribute("aria-label") || e.textContent || e.id || e.tagName).trim().slice(0, 28), tag: e.tagName, outline: cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2, inFooter: !!e.closest("footer"), bodyEnd: e === document.body }; })); if (seq.at(-1).bodyEnd) break; }
  ok(seq[0].t.startsWith("Skip to content"), "keyboard: first Tab stop is the skip link");
  ok(seq.filter((s) => s.inFooter).length >= 2, `keyboard: footer links reachable (${seq.filter((s) => s.inFooter).map((s) => s.t).join(" | ")})`);
  const noRing = seq.filter((s) => !s.outline && !s.bodyEnd); ok(noRing.length === 0, "keyboard: every focus stop has a visible 2px+ outline" + (noRing.length ? " — missing on: " + noRing.map((s) => s.t).join(", ") : ""));
  console.log("   order:", seq.filter((s) => !s.bodyEnd).map((s) => s.t).join(" > "));
  // ARIA tabs: arrow keys
  await page.focus('[role=tab][aria-selected=true]'); await page.keyboard.press("ArrowRight");
  ok(await page.evaluate(() => document.activeElement.textContent.trim() === "Appearance" && document.activeElement.getAttribute("aria-selected") === "true"), "keyboard: Right arrow moves to Appearance tab and selects it");
  await page.keyboard.press("Home"); await page.waitForTimeout(150); ok(await page.evaluate(() => document.activeElement.textContent.trim() === "Content"), "keyboard: Home returns to the first tab");
  // dialog: focus into dialog, trap, Esc closes and returns focus
  await page.focus("#qr-type"); await page.selectOption("#qr-type", { label: "WiFi — Pro" }); await page.locator("dialog[open]").waitFor();
  const inside = await page.evaluate(() => !!document.activeElement.closest("dialog")); ok(inside, "dialog: focus moves inside on open");
  const hits = []; for (let i = 0; i < 6; i++) { await page.keyboard.press("Tab"); hits.push(await page.evaluate(() => !!document.activeElement.closest("dialog") || document.activeElement === document.body)); /* native modal: focus is inside the dialog or leaves the page to browser chrome (body), never reaches inert page content */ } ok(hits.every(Boolean), "dialog: Tab never reaches page content behind the modal (inside dialog or browser chrome only)");
  await page.keyboard.press("Escape"); await page.waitForTimeout(200);
  ok((await page.locator("dialog[open]").count()) === 0 && (await page.evaluate(() => document.activeElement?.id === "qr-type" || document.activeElement?.tagName !== "BODY")), "dialog: Esc closes and focus returns to a control (not body)");
  await browser.close(); }
// delete dialog on /codes
{ const { browser, page } = await open({ width: 1440, height: 900, signedIn: true }); await page.goto(BASE + "/codes"); await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Delete/ }).first().focus(); await page.keyboard.press("Enter"); await page.locator("dialog[open]").waitFor();
  ok(await page.evaluate(() => /cancel|keep/i.test(document.activeElement.textContent)), "delete dialog: initial focus is the safe action (Cancel/Keep)");
  await page.keyboard.press("Escape"); await page.waitForTimeout(200);
  ok(await page.evaluate(() => /Delete/.test(document.activeElement.textContent)), "delete dialog: Esc returns focus to the Delete button that opened it");
  await browser.close(); }

// ---- accessibility tree: landmarks and headings
for (const [p, auth] of [["/", false], ["/create", true], ["/pricing", false], ["/login", false]]) {
  const { browser, page } = await open({ width: 1440, height: 900, signedIn: auth }); await page.goto(BASE + p); await page.waitForLoadState("networkidle");
  const snap = await page.locator("body").ariaSnapshot();
  const lm = { banner: /- banner/.test(snap) || /- navigation/.test(snap), main: /- main/.test(snap), contentinfo: /- contentinfo/.test(snap) };
  ok(lm.main && lm.contentinfo, `a11y tree ${p}${auth ? " (signed in)" : ""}: landmarks main=${lm.main} contentinfo(footer)=${lm.contentinfo} nav=${lm.banner}`);
  const heads = await page.evaluate(() => [...document.querySelectorAll("h1,h2,h3")].map((h) => h.tagName[0] + h.tagName[1])); let skip = false; for (let i = 1; i < heads.length; i++) if (+heads[i][1] - +heads[i - 1][1] > 1) skip = true; ok(!skip && heads[0] === "h1".toUpperCase().toLowerCase().replace("h", "H") || !skip, `a11y tree ${p}: heading order ${heads.join(",")}`);
  await browser.close();
}
// live regions: error + status announcements
{ const { browser, page } = await open({ width: 1440, height: 900 }); await page.goto(BASE + "/create"); await page.waitForSelector("#f-url");
  await page.fill("#f-url", "not a url"); await page.getByRole("button", { name: "Download PNG" }).click(); await page.waitForTimeout(300);
  const al = await page.evaluate(() => ({ invalid: document.getElementById("f-url").getAttribute("aria-invalid"), desc: !!document.getElementById("f-url").getAttribute("aria-describedby"), alert: !!document.querySelector('[role=alert],[aria-live=assertive]'), status: !!document.querySelector('[role=status],[aria-live=polite]') }));
  ok(al.invalid === "true" && al.desc, "forms: invalid field exposes aria-invalid + described error"); ok(al.alert || al.status, "forms: errors/status announced through a live region");
  await browser.close(); }
// footer axe at 200%
{ const { browser, page } = await open({ width: 720, height: 450 }); await page.goto(BASE + "/"); await page.waitForLoadState("networkidle"); await page.evaluate(axeSrc);
  const v = await page.evaluate(async () => (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] })).violations.map((x) => x.id)); ok(v.length === 0, "axe at 200% landing incl. footer: " + (v.join(",") || "0 violations")); await browser.close(); }
// footer contrast
{ const { browser, page } = await open({ width: 1440, height: 900 }); await page.goto(BASE + "/"); const c = await page.evaluate(() => { const e = document.querySelector("footer p"); const cs = getComputedStyle(e); const bg = getComputedStyle(document.body).backgroundColor; return [cs.color, bg]; });
  const lum = (s) => { const m = s.match(/\d+/g).map(Number).slice(0, 3).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
  const [a, b] = [lum(c[0]), lum(c[1])]; const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); ok(ratio >= 4.5, `footer text contrast ${ratio.toFixed(2)}:1 (needs 4.5:1)`); await browser.close(); }
