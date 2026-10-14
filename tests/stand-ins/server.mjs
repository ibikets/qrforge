// Local stand-ins: Supabase (auth user + PostgREST subset) on :54321, Paystack on :54322. Test-only.
import http from "http";
const uid = "11111111-1111-4111-8111-111111111111";
const state = {
  user: { id: uid, aud: "authenticated", role: "authenticated", email: "tester@example.com", app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
  qr_codes: [], subscriptions: [], payments: [],
  fail: {}, // e.g. { qr_codes_read: true, qr_codes_delete: true, qr_codes_write: true, subs_read: true }
  paystack: {}, // reference -> tx
  log: [],
};
const json = (res, code, body, headers = {}) => { res.writeHead(code, { "content-type": "application/json", ...headers }); res.end(JSON.stringify(body)); };
const body = (req) => new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d ? JSON.parse(d) : null)); });

function filterRows(rows, params) {
  let out = rows;
  for (const [k, v] of params) {
    if (["select", "order", "limit", "offset", "columns"].includes(k)) continue;
    const m = /^(eq|neq|gt|gte|lt|lte|is|in)\.(.*)$/.exec(v);
    if (!m) continue;
    const [, op, val] = m;
    out = out.filter((r) => op === "eq" ? String(r[k]) === val : op === "is" ? (val === "null" ? r[k] == null : String(r[k]) === val) : true);
  }
  const ord = params.get("order");
  if (ord) { const [col, dir] = ord.split("."); out = [...out].sort((a, b) => (a[col] > b[col] ? 1 : -1) * (dir === "desc" ? -1 : 1)); }
  const lim = params.get("limit"); if (lim) out = out.slice(0, +lim);
  return out;
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  res.setHeader("access-control-allow-origin", req.headers.origin ?? "*");
  res.setHeader("access-control-allow-headers", req.headers["access-control-request-headers"] ?? "*");
  res.setHeader("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS");
  res.setHeader("access-control-expose-headers", "content-range");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  if (u.pathname === "/__ctl") { // control: GET state, POST merge
    if (req.method === "POST") { const b = await body(req); Object.assign(state, b.set ?? {}); if (b.reset) { state.qr_codes = []; state.subscriptions = []; state.payments = []; state.fail = {}; state.log = []; state.rpcMode = undefined; state.dbLimit = undefined; state.rpcCalls = 0; } if (b.fail !== undefined) state.fail = b.fail; if (b.push) for (const [t, rows] of Object.entries(b.push)) state[t].push(...rows); }
    return json(res, 200, { ...state, user: undefined });
  }
  if (u.pathname === "/auth/v1/user" && req.method === "GET") return json(res, 200, state.user);
  if (u.pathname === "/auth/v1/logout") { res.writeHead(204); return res.end(); }
  if (u.pathname === "/auth/v1/recover") { state.log.push({ op: "recover" }); return json(res, state.fail.recover ? 429 : 200, state.fail.recover ? { code: 429, error_code: "over_email_send_rate_limit", msg: "rate limit" } : {}); }
  if (u.pathname === "/auth/v1/token") return json(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials", error_code: "invalid_credentials", msg: "Invalid login credentials" });
  if (u.pathname === "/auth/v1/signup") return json(res, 200, { id: "22222222-2222-4222-8222-222222222222", email: "new@example.com", identities: [{}], app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: new Date().toISOString() });
  if (u.pathname === "/auth/v1/resend") return json(res, 200, {});
  if (u.pathname === "/auth/v1/user" && req.method === "PUT") return json(res, state.fail.updateUser ? 422 : 200, state.fail.updateUser ? { code: 422, error_code: "same_password", msg: "New password should be different from the old password." } : state.user);
  if (u.pathname.startsWith("/auth/v1/")) return json(res, 400, { msg: "mock: unsupported", error_code: "mock" });
  if (u.pathname === "/rest/v1/rpc/apply_payment" && req.method === "POST") {
    const a = await body(req);
    if (state.rpcMode !== "atomic") return json(res, 404, { code: "PGRST202", message: "Could not find the function qrforge.apply_payment in the schema cache" });
    if (state.fail.rpc) return json(res, 500, { code: "XX000", message: "mock failure" });
    if (a.p_user === "00000000-0000-4000-8000-000000000000") return json(res, 409, { code: "23503", message: "violates foreign key constraint" });
    state.rpcCalls = (state.rpcCalls ?? 0) + 1;
    const cur = state.subscriptions.find((x) => x.user_id === a.p_user);
    if (state.payments.some((p) => p.reference === a.p_reference)) return json(res, 200, cur?.current_period_end ?? null);
    const base = cur && new Date(cur.current_period_end) > new Date() ? new Date(cur.current_period_end) : new Date();
    base.setDate(base.getDate() + a.p_days);
    state.payments.push({ reference: a.p_reference, user_id: a.p_user, plan: a.p_plan, amount_kobo: a.p_amount, status: "success" });
    const row = { user_id: a.p_user, plan: a.p_plan, current_period_end: base.toISOString(), auto_renew: a.p_auto_renew ?? cur?.auto_renew ?? true, authorization_code: a.p_authorization_code ?? cur?.authorization_code ?? null };
    if (cur) Object.assign(cur, row); else state.subscriptions.push(row);
    return json(res, 200, base.toISOString());
  }
  const m = /^\/rest\/v1\/(\w+)$/.exec(u.pathname);
  if (!m) return json(res, 404, { message: "not found" });
  const table = m[1];
  if (!state[table]) return json(res, 404, { message: "no table" });
  const accept = req.headers.accept ?? "";
  const single = accept.includes("vnd.pgrst.object");
  const prefer = req.headers.prefer ?? "";
  const send = (rows, code = 200) => {
    const h = {}; if (prefer.includes("count=exact")) h["content-range"] = `0-${Math.max(rows.length - 1, 0)}/${rows.length}`;
    if (req.method === "HEAD") { res.writeHead(200, h); return res.end(); }
    if (single) return rows.length === 1 ? json(res, code, rows[0], h) : json(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${rows.length} rows` });
    return json(res, code, rows, h);
  };
  const failKey = { qr_codes: { GET: "qr_codes_read", HEAD: "qr_codes_read", DELETE: "qr_codes_delete", POST: "qr_codes_write", PATCH: "qr_codes_write" }, subscriptions: { GET: "subs_read" }, payments: { GET: "pay_read" } }[table]?.[req.method];
  if (failKey && state.fail[failKey]) return json(res, 500, { code: "XX000", message: "mock failure" });
  // RLS stand-in: everything belongs to the single test user
  if (req.method === "GET" || req.method === "HEAD") return send(filterRows(state[table], u.searchParams));
  if (req.method === "POST") {
    const b = await body(req); const rows = (Array.isArray(b) ? b : [b]).map((r) => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...r }));
    if (table === "payments" && rows.some((r) => state.payments.some((p) => p.reference === r.reference))) return json(res, 409, { code: "23505", message: "duplicate key value violates unique constraint" });
    if (table === "subscriptions") { /* upsert */ for (const r of rows) { const i = state.subscriptions.findIndex((x) => x.user_id === r.user_id); if (i >= 0) { Object.assign(state.subscriptions[i], r); } else state.subscriptions.push(r); } return send(rows, 201); }
    if (table === "qr_codes" && state.dbLimit != null && state.qr_codes.length >= state.dbLimit) return json(res, 400, { code: "QF001", message: "saved-code limit reached for plan free" });
    if (table === "qr_codes") { state.log.push({ op: "insert", n: state.qr_codes.length }); }
    state[table].push(...rows); return send(rows, 201);
  }
  if (req.method === "PATCH") { const b = await body(req); const hit = filterRows(state[table], u.searchParams); hit.forEach((r) => Object.assign(r, b)); return send(hit); }
  if (req.method === "DELETE") { const hit = filterRows(state[table], u.searchParams); state[table] = state[table].filter((r) => !hit.includes(r)); return send(hit); }
  json(res, 405, {});
}).listen(54321);

// Paystack stand-in
http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/__tx") { const b = await body(req); state.paystack[b.reference] = b.tx; return json(res, 200, { ok: true }); }
  if (u.pathname === "/transaction/initialize") { const b = await body(req); state.log.push({ op: "init", b }); return json(res, 200, { status: true, data: { authorization_url: "http://localhost:54322/pay/" + b.reference, reference: b.reference } }); }
  const v = /^\/transaction\/verify\/(.+)$/.exec(u.pathname);
  if (v) { const tx = state.paystack[decodeURIComponent(v[1])]; if (!tx) return json(res, 404, { status: false, message: "Transaction reference not found" }); if (tx.__fail) return json(res, 500, { status: false }); return json(res, 200, { status: true, data: tx }); }
  json(res, 404, {});
}).listen(54322);
console.log("mock up");
