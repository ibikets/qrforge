// Security regression suite (stand-in Supabase/Paystack). Run against `next start` on :3200.
import { createHmac } from "node:crypto";
import { createRequire } from "node:module";
import { ctl, tx, BASE, UID, sub, sessionCookie } from "./lib.mjs";
const sharp = createRequire((process.env.QRF_ROOT ?? process.cwd()) + "/package.json")("sharp");
const ok = (c, m) => console.log((c ? "PASS " : "FAIL ") + m);
const ck = sessionCookie(); const cookie = `${ck.name}=${ck.value}`;
const J = (path, body, headers = {}, method = "POST", raw) => fetch(BASE + path, { method, headers: { "content-type": "application/json", cookie, ...headers }, body: raw ?? JSON.stringify(body) });
const png = (await sharp({ create: { width: 64, height: 64, channels: 3, background: "#0a7" } }).png().toBuffer()).toString("base64");
const good = { name: "x", type: "url", fields: { url: "example.com" }, style: { size: 256 } };

await ctl({ reset: true }); await ctl({ push: { subscriptions: [sub("pro", 20)] } });
// --- headers
const h = (await fetch(BASE + "/pricing")).headers;
ok(/frame-ancestors 'none'/.test(h.get("content-security-policy") ?? "") && h.get("x-frame-options") === "DENY" && h.get("x-content-type-options") === "nosniff", "headers: CSP frame-ancestors, X-Frame-Options, nosniff");
ok(!h.get("x-powered-by"), "headers: X-Powered-By removed");
ok(/no-store/.test((await J("/api/generate", { type: "url", format: "png", size: 256, fields: { url: "a.co" } })).headers.get("cache-control") ?? ""), "api responses are no-store");
// --- cross-site
for (const [path, method, body] of [["/api/codes", "POST", good], ["/api/codes/" + UID, "DELETE"], ["/api/billing/auto-renew", "POST", { enabled: false }], ["/api/paystack/initialize", "POST", { plan: "pro" }]]) {
  const r = await J(path, body, { origin: "https://evil.example" }, method);
  ok(r.status === 403, `cross-site Origin blocked: ${method} ${path} -> ${r.status}`);
}
ok((await J("/api/codes", good, { origin: BASE })).status === 200, "same-origin Origin accepted");
ok((await J("/api/codes", good)).status === 200, "no Origin header (non-browser client) accepted");
// --- size limits and bad input
ok((await J("/api/generate", null, {}, "POST", "x".repeat(450_000))).status === 413, "oversized body -> 413 before parsing");
ok((await J("/api/codes", null, {}, "POST", "{bad")).status === 400, "malformed JSON -> 400");
ok((await J("/api/codes", { ...good, id: "not-a-uuid" })).status === 404, "non-UUID id rejected without a database call");
// --- logo verification
const logoStyle = (b64, label = "png") => ({ fg: "#000000", bg: "#ffffff", dots: "square", size: 256, logo: `data:image/${label};base64,${b64}` });
const gen = (style) => J("/api/generate", { type: "url", format: "png", size: 256, fields: { url: "example.com" }, style });
ok((await gen(logoStyle(png))).status === 200, "genuine PNG logo accepted (Pro)");
const svgAsPng = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>').toString("base64");
ok((await gen(logoStyle(svgAsPng))).status === 400, "SVG bytes labelled image/png rejected");
ok((await gen(logoStyle(png, "jpeg"))).status === 400, "PNG bytes labelled image/jpeg rejected");
ok((await gen(logoStyle("AAAA"))).status === 400, "garbage bytes labelled png rejected");
const big = (await sharp({ create: { width: 5000, height: 5000, channels: 3, background: "#fff" } }).png({ compressionLevel: 9 }).toBuffer()).toString("base64");
ok(big.length > 150000 || (await gen(logoStyle(big))).status === 400, "pixel-bomb logo rejected (too large to pass the size cap, or by dimensions)");
const mid = (await sharp({ create: { width: 2600, height: 2600, channels: 3, background: "#fff" } }).png({ compressionLevel: 9 }).toBuffer()).toString("base64");
ok(mid.length <= 150000 && (await gen(logoStyle(mid))).status === 400, "2600x2600 logo within the byte cap is rejected by dimension limit");
const s = await J("/api/codes", { ...good, style: logoStyle(svgAsPng) }); ok(s.status === 400, "saving a mislabelled logo is rejected too");
// --- DB-level limit mapping (migration present)
await ctl({ reset: true }); await ctl({ set: { dbLimit: 0 } });
let r = await J("/api/codes", good); let j = await r.json();
ok(r.status === 403 && j.code === "limit" && !/QF001|saved-code/.test(JSON.stringify(j)), "database QF001 maps to the friendly 403 limit response, no internals");
await ctl({ reset: true }); await ctl({ fail: { qr_codes_write: true } });
r = await J("/api/codes", good); j = await r.json();
ok(r.status === 500 && !/mock|XX000/.test(JSON.stringify(j)), "unexpected database error returns a generic message");
// --- rate limit
await ctl({ reset: true });
let last = 0; for (let i = 0; i < 45; i++) last = (await J("/api/generate", { type: "url", format: "png", size: 128, fields: { url: "a.co" } }, { "x-real-ip": "203.0.113.9" })).status;
ok(last === 429, "generate: 41st request in a minute from one IP -> 429");
const other = await J("/api/generate", { type: "url", format: "png", size: 128, fields: { url: "a.co" } }, { "x-real-ip": "203.0.113.10" });
ok(other.status === 200, "a different IP is not limited");
// --- payments through the atomic RPC
const sign = (raw) => createHmac("sha512", "sk_test_mock").update(raw).digest("hex");
const hook = (ref) => { const raw = JSON.stringify({ event: "charge.success", data: { reference: ref } }); return fetch(BASE + "/api/paystack/webhook", { method: "POST", body: raw, headers: { "x-paystack-signature": sign(raw) } }); };
const goodTx = (user = UID, plan = "pro") => ({ status: "success", amount: plan === "pro" ? 350000 : 950000, currency: "NGN", metadata: { user_id: user, plan, auto_renew: true }, authorization: { reusable: true, authorization_code: "AUTH_x" }, customer: { email: "tester@example.com" } });
await ctl({ reset: true }); await ctl({ set: { rpcMode: "atomic" } });
await tx("rpc_1", goodTx()); ok((await hook("rpc_1")).status === 200, "atomic path: webhook -> 200");
let st = await ctl(); const end1 = st.subscriptions[0]?.current_period_end;
ok(st.subscriptions[0]?.plan === "pro" && st.payments.length === 1 && st.rpcCalls === 1, "atomic path: plan applied through apply_payment once");
await hook("rpc_1"); st = await ctl(); ok(st.subscriptions[0].current_period_end === end1 && st.payments.length === 1, "atomic path: duplicate webhook changes nothing");
await tx("rpc_ghost", goodTx("00000000-0000-4000-8000-000000000000")); ok((await hook("rpc_ghost")).status === 200, "unknown user in metadata -> permanent failure answered 200 (no endless retries)");
await tx("rpc_bad", goodTx("not-a-uuid")); ok((await hook("rpc_bad")).status === 200, "non-UUID user in metadata -> 200, not applied");
st = await ctl(); ok(st.payments.length === 1, "failed activations left no payment rows");
await ctl({ set: { fail: { rpc: true } } }); await tx("rpc_down", goodTx()); ok((await hook("rpc_down")).status === 503, "database outage during apply -> 503 so Paystack retries");
// --- fallback when migration not applied
await ctl({ reset: true }); await tx("leg_1", goodTx()); ok((await hook("leg_1")).status === 200, "no migration yet: falls back to the legacy path");
st = await ctl(); ok(st.subscriptions[0]?.plan === "pro" && st.payments.length === 1, "legacy fallback applied the plan");
// --- cron auth
ok((await fetch(BASE + "/api/cron/renew")).status === 401, "cron without secret -> 401");
ok((await fetch(BASE + "/api/cron/renew", { headers: { authorization: "Bearer wrong" } })).status === 401, "cron wrong secret -> 401");
