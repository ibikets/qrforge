// Local stand-ins: Supabase (auth user + PostgREST subset) on :54321, Paystack on :54322. Test-only.
import http from "http";
const uid = "11111111-1111-4111-8111-111111111111";
const state = {
  user: { id: uid, aud: "authenticated", role: "authenticated", email: "tester@example.com", app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
  qr_codes: [], subscriptions: [], payments: [],
  users: {}, // id -> user, set through /__ctl {users:{...}}
  tables: {}, // generic tables for the management portal, created on first use
  rpc: {}, // function name -> canned result (or {__status, __body}); default null
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
    const g = (r) => { const j = /^(\w+)->>(\w+)$/.exec(k); return j ? r[j[1]]?.[j[2]] : r[k]; }; // PostgREST JSON path (col->>key)
    out = out.filter((r) => op === "eq" ? String(g(r)) === val : op === "neq" ? String(r[k]) !== val : op === "in" ? val.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, "")).includes(String(r[k])) : op === "is" ? (val === "null" ? r[k] == null : String(r[k]) === val) : true);
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
    if (req.method === "POST") { const b = await body(req); Object.assign(state, b.set ?? {}); if (b.reset) { state.qr_codes = []; state.subscriptions = []; state.payments = []; state.fail = {}; state.log = []; state.rpcMode = undefined; state.dbLimit = undefined; state.rpcCalls = 0; } if (b.reset) { state.users = {}; state.creds = {}; state.tables = {}; state.rpc = {}; state.objects = {}; } if (b.users) Object.assign(state.users, b.users); if (b.creds) { state.creds ??= {}; Object.assign(state.creds, b.creds); } if (b.tables) for (const [t, rows] of Object.entries(b.tables)) state.tables[t] = rows; if (b.rpc) Object.assign(state.rpc, b.rpc); if (b.fail !== undefined) state.fail = b.fail; if (b.push) for (const [t, rows] of Object.entries(b.push)) state[t].push(...rows); }
    return json(res, 200, { ...state, user: undefined });
  }
  // Storage stand-in: keeps uploaded objects in memory so the page can show them. Not a model of Supabase Storage policy.
  const so = /^\/storage\/v1\/object\/(?:public\/)?([^/]+)\/(.+)$/.exec(u.pathname);
  if (u.pathname.startsWith("/storage/v1/")) {
    state.objects ??= {};
    if (req.method === "GET" && so) { const o = state.objects[so[2]]; if (!o) return json(res, 404, { message: "not found" }); res.writeHead(200, { "content-type": o.type }); return res.end(o.data); }
    if (state.fail.storage) { req.resume(); return json(res, 500, { message: "mock storage failure" }); }
    if (req.method === "POST" && so) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks); const ct = req.headers["content-type"] ?? "";
      state.objects[decodeURIComponent(so[2])] = { type: ct.startsWith("multipart/") ? "application/octet-stream" : ct, data: raw };
      state.log.push({ op: "storage_put", bucket: so[1], path: decodeURIComponent(so[2]), bytes: raw.length });
      return json(res, 200, { Key: `${so[1]}/${so[2]}`, Id: crypto.randomUUID() });
    }
    if (req.method === "DELETE") { const b = await body(req); for (const p of b?.prefixes ?? []) delete state.objects[p]; state.log.push({ op: "storage_delete", prefixes: b?.prefixes }); return json(res, 200, []); }
    return json(res, 404, {});
  }
  if (u.pathname === "/auth/v1/user" && req.method === "GET") {
    let sub = uid; try { sub = JSON.parse(Buffer.from((req.headers.authorization ?? "").split(".")[1] ?? "", "base64url").toString()).sub ?? uid; } catch {}
    return json(res, 200, state.users[sub] ?? state.user);
  }
  if (u.pathname === "/auth/v1/admin/users" && req.method === "POST") { const cb = await body(req); state.log.push({ op: "auth_admin_create", email: cb?.email }); const exists = Object.values(state.users).some((x) => x.email === cb?.email); return exists ? json(res, 422, { code: 422, error_code: "email_exists", msg: "A user with this email address has already been registered" }) : json(res, 200, { id: "99999999-0000-4000-8000-000000000001", email: cb?.email }); }
  const au = /^\/auth\/v1\/admin\/users\/([^/]+)(\/.*)?$/.exec(u.pathname);
  if (au) { state.log.push({ op: "auth_admin", method: req.method, path: u.pathname }); const usr = state.users[au[1]] ?? (au[1] === uid ? state.user : null); if (!usr) return json(res, 404, { msg: "User not found" }); if (au[2] === "/factors") return json(res, 200, []); return json(res, 200, { user: usr, ...usr }); }
  if (u.pathname === "/auth/v1/logout") { res.writeHead(204); return res.end(); }
  if (u.pathname === "/auth/v1/recover") { const rb = await body(req); state.log.push({ op: "recover", email: rb?.email, redirect: u.searchParams.get("redirect_to") }); return json(res, state.fail.recover ? 429 : 200, state.fail.recover ? { code: 429, error_code: "over_email_send_rate_limit", msg: "rate limit" } : {}); }
  if (u.pathname === "/auth/v1/token") {
    // Password grant for configured credentials ({creds:{email:{password,id}}} via /__ctl). Anything else is a refusal.
    const tb = await body(req);
    const c = state.creds?.[String(tb?.email ?? "").toLowerCase()];
    state.log.push({ op: "password_grant", email: tb?.email, ok: Boolean(c && c.password === tb?.password) });
    if (tb && c && tb.password !== undefined && c.password === tb.password) {
      const usr = state.users[c.id];
      const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
      const exp = Math.floor(Date.now() / 1000) + 3600, now = Math.floor(Date.now() / 1000);
      const jwt = [b64({ alg: "HS256", typ: "JWT" }), b64({ sub: c.id, exp, role: "authenticated", aal: "aal1", amr: [{ method: "password", timestamp: now }] }), "sig"].join(".");
      return json(res, 200, { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: "r", user: usr });
    }
    return json(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials", error_code: "invalid_credentials", msg: "Invalid login credentials" });
  }
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
  if (u.pathname === "/rest/v1/rpc/publish_page" && req.method === "POST") {
    // Mirrors qrforge.publish_page (the real function is tested on a real Postgres engine in tests/db/pages.test.mjs).
    const a = await body(req); state.log.push({ op: "rpc", fn: "publish_page", args: { p_page: a.p_page, p_expected: a.p_expected } });
    const err = (code, message) => json(res, 400, { code, message });
    const pages = (state.tables.pages ??= []); const revs = (state.tables.page_revisions ??= []);
    const pg = pages.find((x) => x.id === a.p_page && x.user_id === a.p_user);
    if (!pg) return err("QF020", "page not found");
    if (["deleted", "archived"].includes(pg.lifecycle)) return err("QF021", "cannot publish");
    if (pg.taken_down_at) return err("QF022", "disabled");
    if (pg.draft_version !== a.p_expected) return err("QF023", "draft changed");
    const sub = state.subscriptions.find((x) => x.user_id === a.p_user && new Date(x.current_period_end) > new Date());
    if (!sub) return err("QF024", "plan");
    const next = Math.max(0, ...revs.filter((r) => r.page_id === pg.id).map((r) => r.version)) + 1;
    revs.push({ page_id: pg.id, version: next, content: a.p_content, published_by: a.p_user, published_at: new Date().toISOString() });
    Object.assign(pg, { published_version: next, lifecycle: "published", published_at: new Date().toISOString() });
    return json(res, 200, next);
  }
  const rp = /^\/rest\/v1\/rpc\/(\w+)$/.exec(u.pathname);
  if (rp && req.method === "POST") {
    const a = await body(req); state.log.push({ op: "rpc", fn: rp[1], args: a });
    const r = state.rpc[rp[1]];
    if (r && typeof r === "object" && r.__status) return json(res, r.__status, r.__body ?? {});
    return json(res, 200, r ?? null);
  }
  const m = /^\/rest\/v1\/(\w+)$/.exec(u.pathname);
  if (!m) return json(res, 404, { message: "not found" });
  const table = m[1];
  const generic = !["qr_codes", "subscriptions", "payments"].includes(table);
  if (generic) state.tables[table] ??= [];
  if (!generic && !state[table]) return json(res, 404, { message: "no table" });
  const T = () => (generic ? state.tables[table] : state[table]);
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
  // Column-grant stand-in: production grants signed-in users SELECT on these columns only (service role: everything).
  // A browser-session query naming any other column fails with 42501, exactly as Postgres does; it is NOT "undefined column" (42703).
  const GRANTED = { subscriptions: ["user_id", "plan", "current_period_end", "auto_renew", "updated_at"], payments: ["reference", "plan", "amount_kobo", "created_at", "status"] }[table];
  const asService = (req.headers.authorization ?? "") === "Bearer svc-mock";
  if (GRANTED && !asService && (req.method === "GET" || req.method === "HEAD")) {
    const cols = (u.searchParams.get("select") ?? "*").split(",").map((c) => c.trim().split(":")[0].replace(/\(.*/, "")).filter(Boolean);
    const bad = cols.find((c) => c === "*" || !GRANTED.includes(c));
    if (bad) return json(res, 403, { code: "42501", message: `permission denied for table ${table}` });
  }
  // RLS stand-in: everything belongs to the single test user
  if (req.method === "GET" || req.method === "HEAD") return send(filterRows(T(), u.searchParams));
  if (req.method === "POST") {
    const b = await body(req); const DEFAULTS = { content_assets: { state: "active" }, pages: { lifecycle: "draft", draft_version: 1, published_version: null, taken_down_at: null, published_at: null, deleted_at: null } }; // column defaults the real database applies
    const rows = (Array.isArray(b) ? b : [b]).map((r) => ({ ...(DEFAULTS[table] ?? {}), id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...r }));
    if (generic) { state.log.push({ op: "insert", table, rows }); }
    if (table === "payments" && rows.some((r) => state.payments.some((p) => p.reference === r.reference))) return json(res, 409, { code: "23505", message: "duplicate key value violates unique constraint" });
    if (table === "subscriptions") { /* upsert */ for (const r of rows) { const i = state.subscriptions.findIndex((x) => x.user_id === r.user_id); if (i >= 0) { Object.assign(state.subscriptions[i], r); } else state.subscriptions.push(r); } return send(rows, 201); }
    if (table === "pages") {
      for (const r of rows) {
        if (state.tables.pages.some((x) => x.public_id === r.public_id)) return json(res, 409, { code: "23505", message: "duplicate key value violates unique constraint" });
        const sub = state.subscriptions.find((x) => x.user_id === r.user_id && new Date(x.current_period_end) > new Date());
        const max = sub?.plan === "business" ? 25 : sub ? 5 : 0;
        if (state.tables.pages.filter((x) => x.user_id === r.user_id && x.lifecycle !== "deleted").length >= max) return json(res, 400, { code: "QF010", message: "hosted page limit reached" });
      }
    }
    if (table === "qr_codes" && state.dbLimit != null && state.qr_codes.length >= state.dbLimit) return json(res, 400, { code: "QF001", message: "saved-code limit reached for plan free" });
    if (table === "qr_codes") { state.log.push({ op: "insert", n: state.qr_codes.length }); }
    T().push(...rows); return send(rows, 201);
  }
  if (req.method === "PATCH") { const b = await body(req); const hit = filterRows(T(), u.searchParams); hit.forEach((r) => Object.assign(r, b)); return send(hit); }
  if (req.method === "DELETE") { const hit = filterRows(T(), u.searchParams); { const keep = T().filter((r) => !hit.includes(r)); if (generic) state.tables[table] = keep; else state[table] = keep; } return send(hit); }
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
// Resend stand-in (NOT the real service): records each send; state.emailMode = "ok" | "403" | "429" | "500" makes it fail.
http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/domains") return json(res, 200, { data: [{ name: "bitzpark.com", status: state.emailMode === "unverified" ? "pending" : "verified" }] });
  if (/^\/emails\/[0-9a-f-]{36}$/.test(u.pathname) && req.method === "GET") return json(res, 200, { last_event: state.emailMode === "bounce" ? "bounced" : "delivered" });
  if (u.pathname === "/emails" && req.method === "POST") {
    const b = await body(req);
    state.log.push({ op: "email", key: req.headers["idempotency-key"], auth: (req.headers.authorization ?? "").slice(0, 7), to: b?.to, subject: b?.subject, text: b?.text, reply_to: b?.reply_to });
    const m = state.emailMode ?? "ok";
    if (m === "403") return json(res, 403, { message: "The bitzpark.com domain is not verified." });
    if (m === "429") return json(res, 429, { message: "rate limit" });
    if (m === "500") return json(res, 500, { message: "boom" });
    return json(res, 200, { id: crypto.randomUUID() });
  }
  json(res, 404, {});
}).listen(54323);
console.log("mock up");
