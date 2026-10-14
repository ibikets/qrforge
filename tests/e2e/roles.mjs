// Direct-endpoint authorization matrix against the BUILT app + stand-ins (stand-in tests; not real services).
import { BASE, ctl, staffSession } from "./lib.mjs";
let bad = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const ID = (n) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
// Independent oracle (hand-written from the handoff matrix, not imported from the app)
const A = {
  customers: { update_profile: "cu", suspend: "cs", unsuspend: "cs", send_reset: "cr", add_note: "cu", adjust_entitlement: "ea" },
  plans: { create_draft: "pd", discard_draft: "pd", publish: "pp", archive: "pp" },
  campaigns: { save_draft: "pd", publish: "cp", pause: "cp", archive: "cp" },
  payments: { reconcile: "pr", refund_request: "rr", refund_decide: "rd", refund_execute: "rd" },
  content: { save_draft: "cd", restore_revision: "cd", publish: "cpub", upload_asset: "media" },
  staff: { invite: "st", revoke_invite: "st", change_role: "st", revoke: "st", restore: "st" },
  jobs: { preview: "rel", run: "rel", promote: "rel", rollback: "rel" },
  settings: { set: "set", clear: "set" },
  support: { create_ticket: "sup", add_message: "sup", update: "sup", send_reply: "sup" },
};
const CAPSET = {
  owner: "cu cs cr ea pd pp cp rr rd cd cpub media st rel set sup pr",
  support: "cu cs cr sup",
  billing: "ea pd rr pr",
  content_editor: "cd media",
};
const STEP = new Set(["st", "rd", "rel", "pp", "cp", "cpub", "cs", "set"]);
const roles = { owner: 1, support: 2, billing: 3, content_editor: 4 };
await ctl({ reset: true });
const staff = Object.entries(roles).map(([role, n]) => ({ user_id: ID(n), email: `${role}@example.com`, role, extra_grants: [], state: "active", version: 1 }));
staff.push({ user_id: ID(5), email: "revoked@example.com", role: "owner", extra_grants: [], state: "revoked", version: 1 });
staff.push({ user_id: ID(6), email: "editor-pub@example.com", role: "content_editor", extra_grants: ["content.publish"], state: "active", version: 1 });
staff.push({ user_id: ID(7), email: "billing-adj@example.com", role: "billing", extra_grants: ["billing.adjust"], state: "active", version: 1 });
await ctl({ tables: { staff_members: staff } });

const call = async (cookie, route, body, headers = {}) => {
  const r = await fetch(`${BASE}/api/admin/${route}`, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
  let j = {}; try { j = await r.json(); } catch {}
  return { s: r.status, j };
};
let uidn = 100;
const fresh = async (n, email, o) => staffSession(n, email, o);

// 1. role x action matrix (reason "x" is too short: an ALLOWED caller reaches the reason check (422/400/other), a DENIED one gets 403 first)
for (const [role, n] of Object.entries(roles)) {
  const cookie = await fresh(ID(n), `${role}@example.com`);
  const allowed = new Set(CAPSET[role].split(" "));
  let wrong = [];
  for (const [route, acts] of Object.entries(A)) for (const [act, cap] of Object.entries(acts)) {
    const r = await call(cookie, route, { action: act, reason: "x" });
    const should = allowed.has(cap);
    const gotDenied = r.s === 403;
    if (should === gotDenied) wrong.push(`${route}:${act}=${r.s}`);
  }
  ok(wrong.length === 0, `${role}: every action allowed/denied exactly per the matrix` + (wrong.length ? " WRONG " + wrong.join(",") : ""));
}
// 2. extra grants widen exactly one capability
{ const c = await fresh(ID(6), "editor-pub@example.com");
  ok((await call(c, "content", { action: "publish", reason: "x" })).s !== 403, "content editor + content.publish grant may publish");
  ok((await call(c, "plans", { action: "publish", reason: "x" })).s === 403, "…but still cannot publish plans");
  const b = await fresh(ID(7), "billing-adj@example.com");
  ok((await call(b, "customers", { action: "adjust_entitlement", reason: "x" })).s !== 403, "billing + billing.adjust may adjust");
  ok((await call(b, "payments", { action: "refund_decide", reason: "x" })).s === 403, "…but cannot decide refunds"); }
// 3. identity states
{ const r = await call(null, "customers", { action: "update_profile", reason: "x" }); ok(r.s === 401, "anonymous -> 401 (" + r.s + ")");
  const rev = await call(await fresh(ID(5), "revoked@example.com"), "customers", { action: "update_profile", reason: "x" }); ok(rev.s === 403, "revoked staff -> 403 (" + rev.s + ")");
  const ns = await call(await fresh(ID(8), "nobody@example.com"), "customers", { action: "update_profile", reason: "x" }); ok(ns.s === 403, "signed-in non-staff -> 403 (" + ns.s + ")");
  const mfa = await call(await fresh(ID(1), "owner@example.com", { aal: "aal1" }), "customers", { action: "update_profile", reason: "x" }); ok(mfa.s === 403 && mfa.j.code === "mfa_required", "staff without MFA (aal1) -> 403 mfa_required (" + mfa.s + ")");
  const o = await fresh(ID(1), "owner@example.com");
  ok((await call(o, "customers", { action: "update_profile", reason: "x" }, { origin: "https://evil.example" })).s === 403, "cross-site origin blocked");
  ok((await call(o, "customers", { action: "nope", reason: "x" })).s === 400, "unknown action -> 400");
  ok((await call(o, "customers", { action: "__proto__", reason: "x" })).s === 400, "prototype-name action -> 400");
  ok((await call(o, "customers", "{not json")).s === 400, "malformed JSON -> 400");
  ok((await call(o, "customers", [1, 2])).s === 400, "array body -> 400");
  ok((await call(o, "customers", { action: "update_profile", reason: "x".repeat(600) })).s === 422, "over-long reason -> 422");
  const big = await call(o, "customers", { action: "update_profile", reason: "x", pad: "y".repeat(150_000) }); ok(big.s === 400, "oversized body -> 400 (" + big.s + ")"); }
// 4. step-up: stale sign-in blocks only the sensitive actions
{ const stale = await fresh(ID(1), "owner@example.com", { lastSignIn: Date.now() - 20 * 60e3 });
  let wrong = [];
  for (const [route, acts] of Object.entries(A)) for (const [act, cap] of Object.entries(acts)) {
    const r = await call(stale, route, { action: act, reason: "x" });
    const reauth = r.s === 403 && r.j.code === "reauth_required";
    if (STEP.has(cap) !== reauth) wrong.push(`${route}:${act}=${r.s}`);
  }
  ok(wrong.length === 0, "owner signed in 20 min ago: step-up actions need re-auth, others do not" + (wrong.length ? " WRONG " + wrong.join(",") : "")); }
// 5. denied calls write nothing: no audit rows, no auth-admin calls, no data rpc
{ const before = (await ctl()).log.length;
  const sup = await fresh(ID(2), "support@example.com");
  for (const [route, act] of [["staff", "invite"], ["staff", "change_role"], ["plans", "publish"], ["payments", "refund_decide"], ["jobs", "rollback"], ["settings", "set"], ["content", "publish"], ["customers", "adjust_entitlement"]])
    await call(sup, route, { action: act, reason: "long enough reason", email: "x@example.com", role: "owner", user_id: ID(2) });
  const log = (await ctl()).log.slice(before);
  ok(!log.some((l) => (l.op === "insert" && l.table === "audit_events") || l.op === "rpc" || l.op === "auth_admin"), "denied Support calls cause no audit insert, rpc or auth-admin call"); }
// 6. self-escalation and last owner: stand-in rpc reports the DB guard; the route must pass it through, not swallow it
{ const o = await fresh(ID(1), "owner@example.com");
  await ctl({ rpc: { set_staff_role: { __status: 400, __body: { code: "P0001", message: "QF010: last active owner" } } } });
  const r = await call(o, "staff", { action: "change_role", user_id: ID(1), role: "support", reason: "testing the guard" });
  ok(r.s !== 200, "demoting yourself is not reported as success (" + r.s + ")");
  const sp = await call(await fresh(ID(2), "support@example.com"), "staff", { action: "change_role", user_id: ID(2), role: "owner", reason: "self promote please" });
  ok(sp.s === 403, "Support cannot promote themselves to Owner (403)"); }
// 7. pages: anonymous and wrong-role never see data
{ const pages = ["/admin", "/admin/customers", "/admin/payments", "/admin/plans", "/admin/discounts", "/admin/staff", "/admin/audit", "/admin/statistics", "/admin/releases", "/admin/settings", "/admin/security", "/admin/content", "/admin/support"];
  for (const p of pages) { const r = await fetch(BASE + p, { redirect: "manual" }); const t = await r.text(); ok(r.status < 500 && !/owner@example\.com|support@example\.com/.test(t), `anonymous ${p}: ${r.status}, leaks no staff data`); }
  const bill = await fresh(ID(3), "billing@example.com");
  for (const p of ["/admin/staff", "/admin/settings", "/admin/releases", "/admin/content", "/admin/support", "/admin/audit"]) { const r = await fetch(BASE + p, { headers: { cookie: bill } }); const t = await r.text(); ok(r.status < 500 && !/Invite|Promote|Rollback/.test(t.replace(/<script[\s\S]*?<\/script>/g, "")) , `billing ${p}: ${r.status}, no privileged controls rendered`); } }
console.log(bad ? `${bad} FAILED` : "ALL PASS"); process.exit(bad ? 1 : 0);
