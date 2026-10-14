// Staff authentication: separate login, separate session, server-side method checks, recovery, expiry, logout, revocation.
// Runs against the local stand-ins (never real services). Label for the report: stand-in.
import { open, ctl, BASE, UID, SP, sessionCookie, staffSession, STAFF_COOKIE } from "./lib.mjs";
import { seed, IDS } from "./seed-admin.mjs";
import fs from "node:fs";

let bad = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const eq = (a, b, m) => ok(a === b, `${m} (got ${JSON.stringify(a)})`);
const cookieObj = (kv) => { const i = kv.indexOf("="); return { name: kv.slice(0, i), value: kv.slice(i + 1), domain: "localhost", path: "/", httpOnly: false, secure: false, sameSite: "Lax" }; };
// load, then give hydration a moment (a form clicked before hydration would submit natively)
const go = async (page, url) => { const r = await page.goto(url, { waitUntil: "load" }); await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {}); return r; };
const vis = async (loc) => { try { await loc.first().waitFor({ timeout: 15000 }); return true; } catch { return false; } };
const atLogin = async (page) => { try { await page.waitForURL(/\/admin\/login/, { timeout: 15000 }); return true; } catch { return false; } };
const log = async () => (await ctl({})).log;
const axeSrc = fs.readFileSync(process.env.AXE_PATH ?? "node_modules/axe-core/axe.min.js", "utf8");
const axeOf = async (page) => { await page.evaluate(axeSrc); return page.evaluate(async () => (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] })).violations.map((x) => x.id + "×" + x.nodes.length)); };

// Credentials known to the stand-in auth provider. The values are fictional test strings.
const PW = "correct horse battery staple";
const reseed = async () => {
  await seed();
  await ctl({
    users: { [IDS.support]: { id: IDS.support, email: "support@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" } },
    creds: { "support@example.com": { password: PW, id: IDS.support }, "tester@example.com": { password: "customer-password-1", id: UID } },
  });
};
await ctl({ reset: true });
await reseed();

// ---------- 1. Signed-out /admin goes straight to the staff form ----------
{
  const { browser, page, logs } = await open();
  await go(page, `${BASE}/admin`);
  eq(new URL(page.url()).pathname, "/admin/login", "signed-out /admin lands on /admin/login");
  ok(await page.getByRole("heading", { name: "Staff sign-in" }).isVisible(), "staff sign-in heading");
  ok(await vis(page.getByLabel("Staff email")) && await vis(page.getByLabel("Password", { exact: true })), "email and password fields");
  ok((await page.getByRole("button", { name: /google/i }).count()) === 0, "no Google button");
  ok((await page.getByText(/create (an )?account|sign up|register/i).count()) === 0, "no registration offered");
  ok(await vis(page.getByRole("link", { name: "Forgot password?" })), "forgot password link");
  await go(page, `${BASE}/admin/payments`);
  const u = new URL(page.url());
  ok(u.pathname === "/admin/login" && u.searchParams.get("next") === "/admin/payments", "deep link remembered as ?next=");
  const txt = await page.locator("body").innerText();
  ok(!/owner|bootstrap|OWNER_BOOTSTRAP|claim/i.test(txt), "no Owner-bootstrap instructions on the public screen");
  ok(logs.filter((l) => !/status of (4|5)\d\d/.test(l)).length === 0, "no console errors");
  await browser.close();
}

// ---------- 2. Wrong credentials, customer credentials, staff credentials ----------
{
  const { browser, context, page } = await open();
  await go(page, `${BASE}/admin/login`);
  await page.getByRole("button", { name: "Sign in" }).click();
  ok(await page.getByText("Enter your email address.").isVisible() && await page.getByText("Enter your password.").isVisible(), "empty form: both errors beside fields");
  eq(await page.evaluate(() => document.activeElement?.id), "staff-email", "focus moves to first invalid field");
  await page.getByLabel("Staff email").fill("support@example.com");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByText("Email or password is not correct.").waitFor();
  ok(true, "wrong password: neutral message");
  // A real CUSTOMER account with the correct customer password must get the same neutral failure and NO staff session.
  await page.getByLabel("Staff email").fill("tester@example.com");
  await page.getByLabel("Password", { exact: true }).fill("customer-password-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByText("Email or password is not correct.").waitFor();
  ok(!(await context.cookies()).some((c) => c.name.startsWith(STAFF_COOKIE)), "customer password creates no staff session cookie");
  await go(page, `${BASE}/admin`);
  eq(new URL(page.url()).pathname, "/admin/login", "…and /admin still asks for staff sign-in");
  // Real staff credentials: password accepted, then the second step is required before anything is shown.
  await page.getByLabel("Staff email").fill("support@example.com");
  await page.getByLabel("Password", { exact: true }).fill(PW);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin$/);
  await page.getByRole("heading", { name: /Confirm it’s you/ }).waitFor();
  ok(true, "staff password accepted: second step (authenticator) required next");
  ok(!(await page.getByRole("link", { name: "Payments" }).count()), "no management data before the second step");
  const names = (await context.cookies()).map((c) => c.name);
  ok(names.some((n) => n.startsWith(STAFF_COOKIE)) && !names.includes("sb-localhost-auth-token"), "session stored only in the staff cookie");
  await browser.close();
}

// ---------- 3. Customer sessions (password, Google) and wrong-method sessions never reach management ----------
{
  const { browser, context, page } = await open({ signedIn: true });
  for (const p of ["/admin", "/admin/customers", "/admin/payments", "/admin/staff"]) {
    await go(page, BASE + p);
    eq(new URL(page.url()).pathname, "/admin/login", `customer password session: ${p} -> staff login`);
  }
  // Same user id as a real staff member, but only in the CUSTOMER cookie: still nothing.
  const asStaffId = await staffSession(IDS.owner, "owner@example.com");
  const customerCookieForOwner = { ...cookieObj(asStaffId), name: "sb-localhost-auth-token" };
  await context.clearCookies(); await context.addCookies([customerCookieForOwner]);
  await go(page, `${BASE}/admin`);
  ok(await atLogin(page), "an owner's CUSTOMER cookie (e.g. Google sign-in) grants no management access");
  const r = await context.request.post(`${BASE}/api/admin/customers`, { data: { action: "note", reason: "test test" } });
  eq(r.status(), 401, "…and admin API refuses it");
  await context.clearCookies();
  // A staff-cookie session that was NOT created by password (OAuth, magic link, recovery) is rejected server-side.
  for (const m of [["oauth"], ["otp"], ["recovery"], ["oauth", "totp"]]) {
    await context.clearCookies();
    await context.addCookies([cookieObj(await staffSession(IDS.owner, "owner@example.com", { methods: m }))]);
    await go(page, `${BASE}/admin`);
    ok(await atLogin(page), `staff cookie established by ${m.join("+")} is not accepted`);
    const api = await context.request.post(`${BASE}/api/admin/customers`, { data: { action: "note", reason: "test test" } });
    eq(api.status(), 401, `…API refuses ${m.join("+")}`);
  }
  await browser.close();
}

// ---------- 4. Every admin API refuses signed-out and customer callers ----------
{
  const { browser, context } = await open({ signedIn: true });
  const routes = ["customers", "staff", "content", "plans", "settings", "campaigns", "support", "payments", "jobs", "assets", "invite/accept", "bootstrap"];
  for (const r of routes) {
    const res = await context.request.post(`${BASE}/api/admin/${r}`, { data: { action: "x", reason: "xxxxxx", token: "x".repeat(30) } });
    ok([401, 403, 404, 405].includes(res.status()), `/api/admin/${r} with a customer session: ${res.status()}`);
  }
  await browser.close();
}

// ---------- 5. Roles still behave (spot checks; roles.mjs covers the matrix) ----------
{
  const { browser, context, page } = await open();
  await context.addCookies([cookieObj(await staffSession(IDS.owner, "owner@example.com"))]);
  await go(page, `${BASE}/admin/staff`);
  ok(await vis(page.getByRole("heading", { name: "Staff" })), "owner opens staff screen");
  await context.clearCookies();
  await context.addCookies([cookieObj(await staffSession(IDS.billing, "billing@example.com"))]);
  await go(page, `${BASE}/admin/staff`);
  ok(await vis(page.getByText(/No access|cannot open this view/i)), "billing sees an access message on the staff screen");
  // revoked
  await context.clearCookies();
  await context.addCookies([cookieObj(await staffSession(IDS.revoked, "former@example.com"))]);
  await go(page, `${BASE}/admin`);
  ok(await vis(page.getByRole("heading", { name: "Access ended" })), "revoked staff: access-ended state");
  ok(!(await page.getByRole("link", { name: "Payments" }).count()), "revoked staff: no navigation or data");
  const api = await context.request.post(`${BASE}/api/admin/customers`, { data: { action: "note", reason: "test test" }, headers: { origin: BASE } });
  eq(api.status(), 403, "revoked staff: API refuses");
  await browser.close();
}

// ---------- 6. Recovery: neutral, eligibility enforced server-side ----------
{
  const { browser, page } = await open();
  await ctl({ tables: { staff_invites: [{ id: "i1", email: "invitee@example.com", role: "support", extra_grants: [], expires_at: new Date(Date.now() + 864e5).toISOString(), accepted_at: null, revoked_at: null }] } });
  await go(page, `${BASE}/admin/login/forgot`);
  const ask = async (email) => {
    await go(page, `${BASE}/admin/login/forgot`);
    await page.getByLabel("Staff email").fill(email);
    await page.getByRole("button", { name: "Send link" }).click();
    await page.getByText("Check your email").waitFor();
    return page.locator("main, body").first().innerText();
  };
  const before = (await log()).filter((e) => e.op === "recover").length;
  const t1 = await ask("support@example.com");
  const t2 = await ask("nobody@example.com");
  const t3 = await ask("tester@example.com");
  const t4 = await ask("invitee@example.com");
  ok(t1 === t2 && t2 === t3 && t3 === t4, "identical confirmation for staff, stranger, customer and invitee");
  const mails = (await log()).filter((e) => e.op === "recover").slice(before);
  eq(mails.map((m) => m.email).join(","), "support@example.com,invitee@example.com", "link sent only to active staff and the invitee (not a stranger or a customer)");
  ok(mails.every((m) => /\/admin\/auth\/callback\?next=%2Fadmin%2Freset-password$/.test(m.redirect ?? "")), "recovery link returns to the staff flow");
  // Owner email: only while no Owner exists
  const b2 = (await log()).filter((e) => e.op === "recover").length;
  await ask("boot@example.com");
  eq((await log()).filter((e) => e.op === "recover").length, b2, "configured Owner email gets NO link while staff already exist");
  await ctl({ tables: { staff_members: [] } });
  const c0 = (await log()).filter((e) => e.op === "auth_admin_create").length;
  await ask("boot@example.com");
  const L = await log();
  ok(L.filter((e) => e.op === "recover").length === b2 + 1 && L.filter((e) => e.op === "auth_admin_create").length === c0 + 1, "with no Owner yet, the configured Owner email gets a link (account ensured, existing accounts untouched)");
  await ask("somebody-else@example.com");
  eq((await log()).filter((e) => e.op === "recover").length, b2 + 1, "no other email can obtain Owner setup");
  await reseed();
  // expired / missing link
  await go(page, `${BASE}/admin/auth/callback?code=bogus`);
  ok(new URL(page.url()).pathname === "/admin/reset-password" && await vis(page.getByText(/expired|different browser/i)), "bad link: clear expired state");
  await go(page, `${BASE}/admin/reset-password`);
  ok(await vis(page.getByRole("link", { name: "Ask for a new link" })), "no recovery session: offered a new link");
  await browser.close();
}

// ---------- 7. Set password needs the recovery session, enforces length ----------
{
  const { browser, context } = await open();
  const bare = await context.request.post(`${BASE}/api/admin/auth/password`, { data: { password: "a-long-enough-password" } });
  eq(bare.status(), 401, "set-password without a recovery session: refused");
  const short = await context.request.post(`${BASE}/api/admin/auth/password`, { data: { password: "short" } });
  eq(short.status(), 422, "set-password: short password refused");
  await browser.close();
}

// ---------- 8. Idle expiry, safe return, independent logout ----------
{
  const { browser, context, page } = await open();
  await context.addCookies([cookieObj(await staffSession(IDS.owner, "owner@example.com")), sessionCookie()]);
  await context.addCookies([
    { name: "qrf-staff-active", value: String(Date.now() - 25 * 60e3), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" },
    { name: "qrf-active", value: String(Date.now()), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" },
  ]);
  await go(page, `${BASE}/admin/payments?x=1`);
  const u = new URL(page.url());
  ok(u.pathname === "/admin/login" && u.searchParams.get("timeout") === "1" && u.searchParams.get("next") === "/admin/payments?x=1", "idle staff session -> staff login with timeout notice and the page to return to");
  ok(await vis(page.getByText("You were signed out")), "timeout notice shown");
  const names = (await context.cookies()).map((c) => c.name);
  ok(!names.some((n) => n === STAFF_COOKIE || n.startsWith(STAFF_COOKIE + ".")) && !names.includes("qrf-staff-active"), "staff session cookies cleared");
  ok(names.includes("sb-localhost-auth-token") && names.includes("qrf-active"), "customer session and clock untouched");
  const api = await context.request.post(`${BASE}/api/admin/customers`, { data: { action: "note", reason: "test test" } });
  eq(api.status(), 401, "idle staff: API refuses");
  await go(page, `${BASE}/codes`);
  eq(new URL(page.url()).pathname, "/codes", "customer still signed in after the staff session expired");

  // logout is independent
  await context.addCookies([cookieObj(await staffSession(IDS.owner, "owner@example.com"))]);
  await go(page, `${BASE}/admin`);
  ok(await vis(page.getByRole("link", { name: "Payments" })), "staff session works again");
  await page.getByRole("button", { name: "Account menu" }).first().click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL(/\/admin\/login/);
  const after = (await context.cookies()).map((c) => c.name);
  ok(!after.some((n) => n.startsWith(STAFF_COOKIE)), "staff sign-out removes the staff cookie");
  ok(after.includes("sb-localhost-auth-token"), "…and leaves the customer cookie");
  await go(page, `${BASE}/admin`);
  eq(new URL(page.url()).pathname, "/admin/login", "after staff sign-out /admin needs sign-in again");
  await go(page, `${BASE}/create`);
  eq(new URL(page.url()).pathname, "/create", "customer area still open");
  await browser.close();
}

// ---------- 9. Safe return target ----------
{
  const { browser, page } = await open();
  await go(page, `${BASE}/admin/login?next=//evil.example`);
  await page.getByLabel("Staff email").fill("support@example.com");
  await page.getByLabel("Password", { exact: true }).fill(PW);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/localhost:3200\/admin$/);
  ok(true, "open-redirect next is ignored");
  await browser.close();
  const b = await open();
  await go(b.page, `${BASE}/admin/login?next=${encodeURIComponent("/admin/payments")}`);
  await b.page.getByLabel("Staff email").fill("support@example.com");
  await b.page.getByLabel("Password", { exact: true }).fill(PW);
  await b.page.getByRole("button", { name: "Sign in" }).click();
  await b.page.waitForURL(/\/admin\/payments$/);
  ok(true, "valid ?next=/admin/payments is honoured after sign-in");
  await b.browser.close();
}

// ---------- 10. Owner bootstrap: only the configured email, only by staff password sign-in, only once ----------
{
  await ctl({ tables: { staff_members: [] } });
  const BOOT = "aaaaaaaa-0000-4000-8000-0000000000b0";
  const { browser, context, page } = await open();
  const mk = async (id, email, o) => cookieObj(await staffSession(id, email, o));
  await context.addCookies([await mk(BOOT, "boot@example.com")]);
  await go(page, `${BASE}/admin`);
  ok(await vis(page.getByRole("button", { name: "Set up the Owner account" })), "configured Owner email (password sign-in): setup offered");
  ok(!/OWNER_BOOTSTRAP|environment|variable/i.test(await page.locator("body").innerText()), "no operational instructions on screen");
  await context.clearCookies(); await context.addCookies([await mk(BOOT, "boot@example.com", { methods: ["oauth"] })]);
  let r = await context.request.post(`${BASE}/api/admin/bootstrap`);
  eq(r.status(), 403, "Owner email via Google/OAuth cannot claim");
  await context.clearCookies(); await context.addCookies([await mk(IDS.cust, "tester@example.com")]);
  r = await context.request.post(`${BASE}/api/admin/bootstrap`);
  eq(r.status(), 403, "any other email cannot claim (even with a password session)");
  await context.clearCookies(); await context.addCookies([sessionCookie()]);
  r = await context.request.post(`${BASE}/api/admin/bootstrap`);
  eq(r.status(), 401, "customer session cannot claim");
  await context.clearCookies(); await context.addCookies([await mk(BOOT, "boot@example.com")]);
  await ctl({ rpc: { bootstrap_owner: true } });
  r = await context.request.post(`${BASE}/api/admin/bootstrap`);
  eq(r.status(), 200, "configured Owner email by password: claim succeeds once");
  await ctl({ rpc: { bootstrap_owner: false } });
  r = await context.request.post(`${BASE}/api/admin/bootstrap`);
  eq(r.status(), 409, "second claim refused (an Owner exists)");
  await browser.close();
  await reseed();
}

// ---------- 11. Invitations use the staff flow ----------
{
  const { browser, context, page } = await open({ signedIn: true });
  await go(page, `${BASE}/staff-invite?token=${"t".repeat(40)}`);
  const u = new URL(page.url());
  ok(u.pathname === "/admin/login" && (u.searchParams.get("next") ?? "").startsWith("/staff-invite?token="), "invite link sends people to the STAFF sign-in (and back to the invite after), not the customer one");
  const r = await context.request.post(`${BASE}/api/admin/invite/accept`, { data: { token: "t".repeat(40) } });
  eq(r.status(), 401, "a customer session cannot accept a staff invitation");
  await browser.close();
}

// ---------- 12. Customer sign-in is unchanged ----------
{
  const { browser, page } = await open();
  await go(page, `${BASE}/login`);
  ok(await page.getByRole("button", { name: /continue with google/i }).isVisible(), "customer login still offers Google");
  ok(await page.getByRole("button", { name: "Create an account" }).isVisible(), "customer login still offers account creation");
  await page.getByLabel("Email", { exact: true }).fill("tester@example.com");
  await page.getByLabel("Password", { exact: true }).fill("customer-password-1");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/create$/);
  ok(true, "customer email/password sign-in works and lands on /create");
  await go(page, `${BASE}/admin`);
  eq(new URL(page.url()).pathname, "/admin/login", "…and that customer session does not open management");
  await browser.close();
}

// ---------- 13. Mobile, keyboard, accessibility ----------
{
  for (const w of [1440, 390, 320]) {
    const { browser, page } = await open({ width: w, height: 900 });
    for (const p of ["/admin/login", "/admin/login/forgot", "/admin/reset-password?state=expired"]) {
      await go(page, BASE + p);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const ax = await axeOf(page);
      ok(over <= 0 && ax.length === 0, `${p} @${w}: overflow ${over}px, axe ${ax.join(",") || "0"}`);
    }
    if (w === 390) await page.screenshot({ path: `${SP}/staff-login-390.png`, fullPage: true });
    await browser.close();
  }
  const { browser, page } = await open();
  await go(page, `${BASE}/admin/login`);
  await page.getByLabel("Staff email").focus();
  const order = [];
  for (let i = 0; i < 5; i++) { order.push(await page.evaluate(() => document.activeElement?.id || document.activeElement?.textContent?.trim() || document.activeElement?.tagName)); await page.keyboard.press("Tab"); }
  eq(order.slice(0, 2).join(","), "staff-email,staff-password", "keyboard order: email, then password");
  ok(order.includes("Forgot password?") && order.includes("Sign in"), "keyboard reaches Forgot password and Sign in");
  await page.getByLabel("Staff email").fill("support@example.com");
  await page.getByLabel("Password", { exact: true }).fill(PW);
  await page.getByLabel("Password", { exact: true }).press("Enter");
  await page.waitForURL(/\/admin$/);
  ok(true, "Enter submits the form");
  await browser.close();
}

// ---------- 14. Sign-in is rate limited ----------
{
  const { browser, context } = await open();
  let perEmail = 0;
  for (let i = 0; i < 8; i++) {
    const r = await context.request.post(`${BASE}/api/admin/auth/login`, { data: { email: "target@example.com", password: "nope-nope-nope" } });
    if (r.status() === 429) perEmail++;
  }
  ok(perEmail > 0, `guessing one account's password is throttled (${perEmail} of 8 refused)`);
  let perIp = 0;
  for (let i = 0; i < 25; i++) {
    const r = await context.request.post(`${BASE}/api/admin/auth/login`, { data: { email: `x${i}@example.com`, password: "nope-nope-nope" } });
    if (r.status() === 429) perIp++;
  }
  ok(perIp > 0, `spraying many accounts from one address is throttled (${perIp} of 25 refused)`);
  await browser.close();
}

console.log(bad ? `${bad} FAILED` : "ALL PASS");
process.exit(bad ? 1 : 0);
