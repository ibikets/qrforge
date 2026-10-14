import { open, ctl, BASE } from "./lib.mjs";
let bad = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const stale = (ms) => ({ name: "qrf-active", value: String(Date.now() - ms), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" });
await ctl({ reset: true });
// 1. nav: no Sign in when signed in; no flash on first paint
{ const { browser, page } = await open({ signedIn: true });
  await page.goto(BASE + "/", { waitUntil: "commit" });
  const first = await page.locator("header").first().innerText();
  ok(!/Sign in/.test(first), "first paint has no Sign in link (got: " + first.replace(/\n/g, " | ") + ")");
  await page.waitForLoadState("networkidle");
  const t = await page.locator("header").first().innerText();
  ok(!/Sign in/.test(t) && !/Sign out/.test(t), "settled nav: no Sign in, no loose Sign out link");
  const am = page.getByRole("button", { name: "Account menu" }).first(); ok(await am.isVisible(), "round avatar button present");
  await am.click(); const menu = page.getByRole("menu", { name: "Account" });
  ok(await menu.isVisible() && /My account/.test(await menu.innerText()) && /Sign out/.test(await menu.innerText()), "avatar opens My account + Sign out");
  const names = await menu.getByRole("menuitem").allInnerTexts();
  ok(["My account", "Billing", "Sign out"].every((n) => names.some((x) => x.includes(n))), "menu has My account, Billing and Sign out (got: " + names.map((x) => x.trim()).join(" | ") + ")");
  ok(await page.evaluate(() => document.activeElement?.getAttribute("role")) === "menuitem", "opening focuses the first item");
  await page.keyboard.press("ArrowDown"); const f2 = await page.evaluate(() => document.activeElement?.textContent?.trim());
  await page.keyboard.press("End"); const fe = await page.evaluate(() => document.activeElement?.textContent?.trim());
  await page.keyboard.press("Home"); const fh = await page.evaluate(() => document.activeElement?.textContent?.trim());
  ok(/Billing/.test(f2 ?? "") && /Sign out/.test(fe ?? "") && /My account/.test(fh ?? ""), "ArrowDown, End and Home move focus through the items (" + [f2, fe, fh].join(" / ") + ")");
  ok(await menu.getByRole("menuitem").evaluateAll((els) => els.every((e) => getComputedStyle(e).textDecorationLine === "none")), "menu items are not underlined");
  await page.keyboard.press("Escape"); ok(!(await menu.isVisible()), "Escape closes the menu");
  ok(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")) === "Account menu", "focus returns to the avatar button");
  await page.getByRole("button", { name: "Menu" }).first().evaluate(() => {}).catch(() => {});
  // 2. /login redirects away when signed in, honours safe next only
  await page.goto(BASE + "/login"); ok(new URL(page.url()).pathname === "/create", "signed-in /login -> /create");
  await page.goto(BASE + "/login?next=/codes"); ok(new URL(page.url()).pathname === "/codes", "signed-in /login?next=/codes -> /codes");
  await page.goto(BASE + "/login?next=//evil.example"); ok(new URL(page.url()).pathname === "/create" && new URL(page.url()).host === "localhost:3200", "open-redirect next rejected");
  await browser.close(); }
// 3. server-side idle timeout
{ const { browser, context, page } = await open({ signedIn: true });
  await context.addCookies([stale(21 * 60e3)]);
  await page.goto(BASE + "/billing?x=1");
  const u = new URL(page.url());
  ok(u.pathname === "/login" && u.searchParams.get("timeout") === "1" && u.searchParams.get("next") === "/billing?x=1", "stale session -> /login?timeout=1&next=/billing?x=1");
  ok(await page.getByText("You were signed out").count() > 0, "timeout notice shown");
  const names = (await context.cookies()).map((c) => c.name);
  ok(!names.includes("sb-localhost-auth-token") && !names.includes("qrf-active"), "session + activity cookies cleared");
  const r = await page.request.post(BASE + "/api/session"); ok(r.status() === 204, "anonymous activity ping is harmless (204)");
  await browser.close(); }
{ const { browser, context, page } = await open({ signedIn: true });
  await context.addCookies([stale(21 * 60e3)]);
  const r = await page.request.get(BASE + "/api/codes"); ok(r.status() === 401, "stale session on API -> 401 (got " + r.status() + ")");
  await browser.close(); }
// 4. activity inside the window keeps the session; ping renews the clock
{ const { browser, context, page } = await open({ signedIn: true });
  await context.addCookies([stale(15 * 60e3)]);
  await page.goto(BASE + "/codes"); ok(new URL(page.url()).pathname === "/codes", "15 min idle: still signed in");
  const c = (await context.cookies()).find((x) => x.name === "qrf-active"); ok(c && Date.now() - Number(c.value) < 5000, "activity clock renewed");
  await browser.close(); }
// 5. client watcher: warns, then signs out (fake clock)
{ const { browser, context, page } = await open({ signedIn: true });
  await page.clock.install(); await page.goto(BASE + "/codes"); await page.waitForLoadState("networkidle");
  await page.clock.fastForward(19 * 60e3 + 10e3);
  ok(await page.getByRole("dialog", { name: "Still there?" }).isVisible(), "warning appears about a minute before timeout");
  await page.getByRole("button", { name: "Stay signed in" }).click();
  ok(!(await page.getByRole("dialog", { name: "Still there?" }).isVisible()), "Stay signed in dismisses and resets");
  await page.clock.fastForward(21 * 60e3);
  await page.waitForURL(/\/login\?timeout=1/, { timeout: 8000 }).catch(() => {});
  ok(/\/login\?timeout=1/.test(page.url()), "idle tab is signed out and sent to /login?timeout=1");
  await browser.close(); }
console.log(bad ? `${bad} FAILED` : "ALL PASS"); process.exit(bad ? 1 : 0);
