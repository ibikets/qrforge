// Billing page against the BUILT app + stand-ins. The stand-in enforces production's column grants for signed-in users
// (no read access to subscriptions.renewal_kobo / payments.discount_kobo), which is what broke the page. Stand-in test, not real Supabase.
import { open, ctl, BASE, UID, sub } from "./lib.mjs";
let bad = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const { browser, page, logs } = await open({ width: 1280, height: 900, signedIn: true });
const go = async () => { await page.goto(BASE + "/billing", { waitUntil: "domcontentloaded" }); await page.getByText(/Payment history|couldn’t load your billing details/).first().waitFor(); };
const text = async () => (await page.locator("main").innerText());
const end = new Date(Date.now() + 20 * 864e5);
const endTxt = end.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

// 1. paid plan with an agreed renewal price and a discounted payment
await ctl({ reset: true, push: {
  subscriptions: [sub("pro", 20, { auto_renew: true, authorization_code: "AUTH_x", renewal_kobo: 250000 })],
  payments: [{ reference: "ref-1", user_id: UID, plan: "pro", amount_kobo: 250000, discount_kobo: 100000, status: "success", created_at: new Date().toISOString() },
             { reference: "ref-2", user_id: UID, plan: "pro", amount_kobo: 350000, status: "success", created_at: new Date(Date.now() - 864e5).toISOString() }] } });
await go();
let t = await text();
ok(!/couldn’t load your billing/.test(t), "billing loads (no error panel)");
ok(/Pro/.test(t) && t.includes(`Renews automatically on ${endTxt} at ₦2,500`), "plan, expiry and the agreed renewal price are shown");
ok(t.includes("Saved ₦1,000 with an offer") && t.includes("₦3,500") && t.includes("₦2,500"), "payment history shows both payments and the offer saving");

// 2. no renewal price stored -> plan price applies (not an error)
await ctl({ reset: true, push: { subscriptions: [sub("pro", 20, { auto_renew: true, authorization_code: "AUTH_x" })], payments: [] } });
await go();
t = await text();
ok(t.includes("at ₦3,500") && t.includes("No payments yet."), "no stored renewal price -> plan price; empty history is 'No payments yet.'");

// 3. a genuine failure stays distinguishable from empty
await ctl({ reset: true, push: { subscriptions: [sub("pro", 20)], payments: [] }, fail: { subs_read: true } });
await go();
t = await text();
ok(/couldn’t load your billing details/.test(t) && !/No payments yet/.test(t), "a failed read shows the error, never a fake empty state");
await ctl({ reset: true, push: { subscriptions: [sub("pro", 20)], payments: [{ reference: "r", user_id: UID, plan: "pro", amount_kobo: 350000, status: "success", created_at: new Date().toISOString() }] }, fail: { pay_read: true } });
await go();
t = await text();
ok(/couldn’t load your payment history/.test(t) && !/No payments yet/.test(t) && /Pro/.test(t), "failed payment read: history error only, plan still shown");

// 4. free user
await ctl({ reset: true });
await go();
t = await text();
ok(t.includes("Free") && t.includes("You’re on the Free plan.") && t.includes("No payments yet."), "free user: Free plan, no payments");
ok(logs.filter((l) => !/Failed to load resource/.test(l)).length === 0, "no browser errors");
await browser.close();
console.log(bad ? `\n${bad} FAILED` : "\nall passed");
process.exit(bad ? 1 : 0);
