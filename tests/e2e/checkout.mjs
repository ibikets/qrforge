// Quote -> initialize server contract, against the BUILT app + stand-ins (stand-in tests; not real Paystack/Supabase).
import { BASE, SP, ctl, UID, sessionCookie, sub } from "./lib.mjs";
let bad = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const sc = sessionCookie(); const cookie = `${sc.name}=${sc.value}`;
const post = async (path, body, c = cookie, h = {}) => { const r = await fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json", ...(c ? { cookie: c } : {}), ...h }, body: JSON.stringify(body) }); let j = {}; try { j = await r.json(); } catch {} return { s: r.status, j }; };
const Q = "bbbbbbbb-0000-4000-8000-000000000001";
const quoteRow = (o = {}) => ({ id: Q, user_id: UID, plan: "pro", payable_kobo: 250000, state: "open", reference: null, ...o });
const lastInit = async () => (await ctl()).log.filter((l) => l.op === "init").at(-1)?.b;

await ctl({ reset: true });
ok((await post("/api/checkout/quote", { plan: "pro" }, null)).s === 401, "quote: anonymous -> 401");
ok((await post("/api/checkout/quote", { plan: "free" })).s === 400, "quote: free plan -> 400");
ok((await post("/api/checkout/quote", { plan: "pro" }, cookie, { origin: "https://evil.example" })).s === 403, "quote: cross-site blocked");
// server issues the quote; amount in the browser body is ignored
await ctl({ rpc: { issue_quote: { id: Q, base_kobo: 350000, saving_kobo: 100000, payable_kobo: 250000, renewal_kobo: 350000, period_days: 30, campaign_id: null } } });
{ const r = await post("/api/checkout/quote", { plan: "pro", amount: 1, payableKobo: 1 });
  ok(r.s === 200 && r.j.quote.payableKobo === 250000 && r.j.quote.renewalKobo === 350000 && r.j.quote.id === Q, "quote: server price and regular renewal price returned, browser amount ignored");
  const call = (await ctl()).log.filter((l) => l.op === "rpc" && l.fn === "issue_quote").at(-1).args;
  ok(!("amount" in call) && !("payableKobo" in call) && call.p_user === UID, "issue_quote receives only user, plan, code hash, idempotency key, renewal choice"); }
ok((await post("/api/checkout/quote", { plan: "pro", code: "bad code!!" })).s === 422, "quote: malformed code -> generic unavailable (422)");
await ctl({ rpc: { issue_quote: { __status: 400, __body: { code: "P0001", message: "QF021 not available" } } } });
{ const r = await post("/api/checkout/quote", { plan: "pro", code: "WELCOME10" }); ok(r.s === 422 && /unavailable or does not apply/.test(r.j.error), "quote: ineligible code -> same neutral message (no eligibility leak)"); }
await ctl({ rpc: { issue_quote: { __status: 404, __body: { code: "PGRST202", message: "Could not find the function in the schema cache" } } } });
{ const r = await post("/api/checkout/quote", { plan: "business" }); ok(r.s === 200 && r.j.quote.id === null && r.j.quote.payableKobo === 950000, "quote: migration pending -> plain price, no quote id");
  const c = await post("/api/checkout/quote", { plan: "business", code: "WELCOME10" }); ok(c.s === 422, "quote: migration pending + code -> unavailable, never a silent full price"); }

// initialize
await ctl({ reset: true, tables: { quotes: [quoteRow()] }, rpc: { reserve_redemption: "ok" } });
{ const r = await post("/api/paystack/initialize", { plan: "pro", autoRenew: true, quoteId: Q });
  const b = await lastInit();
  ok(r.s === 200, "initialize with quote -> 200 (" + r.s + ")");
  ok(b.amount === 250000 && b.currency === "NGN" && !("plan" in b) && b.metadata.quote_id === Q && JSON.stringify(b.channels) === '["card"]', "Paystack gets the QUOTED amount in kobo, quote_id in metadata, and NO `plan` parameter"); }
await ctl({ reset: true, tables: { quotes: [quoteRow()] }, rpc: { reserve_redemption: "ok" } });
{ await post("/api/paystack/initialize", { plan: "pro", autoRenew: false, quoteId: null, amount: 1 }); const b = await lastInit(); ok(b.amount === 350000 && !("plan" in b), "no quote: built-in price; browser-supplied amount ignored"); }
await ctl({ reset: true, tables: { quotes: [quoteRow({ user_id: "99999999-9999-4999-8999-999999999999" })] }, rpc: { reserve_redemption: "ok" } });
{ const r = await post("/api/paystack/initialize", { plan: "pro", quoteId: Q }); ok(r.s === 409 && r.j.code === "quote_changed", "someone else's quote -> 409 quote_changed"); ok(!(await lastInit()), "…and Paystack was never called"); }
await ctl({ reset: true, tables: { quotes: [quoteRow({ plan: "business" })] }, rpc: { reserve_redemption: "ok" } });
{ const r = await post("/api/paystack/initialize", { plan: "pro", quoteId: Q }); ok(r.s === 409 && r.j.code === "quote_changed", "quote for a different plan -> 409"); }
await ctl({ reset: true, tables: { quotes: [quoteRow({ state: "paid" })] }, rpc: { reserve_redemption: "ok" } });
{ const r = await post("/api/paystack/initialize", { plan: "pro", quoteId: Q }); ok(r.s === 409 && r.j.code === "already_paid", "paid quote -> 409 already_paid"); }
await ctl({ reset: true, tables: { quotes: [quoteRow()] }, rpc: { reserve_redemption: "expired" } });
{ const r = await post("/api/paystack/initialize", { plan: "pro", quoteId: Q }); ok(r.s === 409 && r.j.code === "quote_changed" && !(await lastInit()), "offer no longer available at reservation -> 409, nothing sent to Paystack"); }
await ctl({ reset: true });
ok((await post("/api/paystack/initialize", { plan: "pro", quoteId: "not-a-uuid" })).s === 400, "malformed quote id -> 400");
ok((await post("/api/paystack/initialize", { plan: "pro" }, null)).s === 401, "initialize: anonymous -> 401");
await ctl({ reset: true, push: { subscriptions: [sub("business", 20)] } });
{ const r = await post("/api/paystack/initialize", { plan: "pro" }); ok(r.s === 409, "active Business cannot buy Pro (409)"); }

// UI: pricing -> checkout
{ const { open } = await import("./lib.mjs"); await ctl({ reset: true, rpc: { issue_quote: { __status: 404, __body: { code: "PGRST202", message: "schema cache" } } } });
  const { browser, page, logs } = await open({ signedIn: true });
  await page.goto(BASE + "/pricing"); await page.waitForSelector("text=Pay in Naira");
  const t = await page.locator("body").innerText();
  ok(/₦3,500/.test(t) && /₦9,500/.test(t) && !/Priority support/.test(t), "pricing: exact prices, no unconfirmed claims");
  await page.getByRole("link", { name: /Choose Pro|Upgrade to Pro/ }).first().click().catch(async () => { await page.goto(BASE + "/checkout?plan=pro"); });
  await page.waitForURL(/\/checkout/); await page.waitForSelector("input[type=checkbox]");
  ok(await page.locator("input[type=checkbox]").isChecked(), "checkout: renewal consent default preserved");
  const ct = await page.locator("body").innerText();
  ok(/₦3,500/.test(ct), "checkout shows the order total from the server quote");
  await page.screenshot({ path: SP + "/checkout-1440.png" }).catch(() => {});
  console.log(logs.filter((l) => !/status of (4|5)\d\d/.test(l)).join("\n") || "no unexpected console errors");
  await browser.close(); }
console.log(bad ? `${bad} FAILED` : "ALL PASS"); process.exit(bad ? 1 : 0);
