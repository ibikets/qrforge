import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import fs from "node:fs";
const REPO = process.env.QRF_ROOT ?? process.cwd();
const dir = process.env.PGDIR || "/tmp/qrf-pg";
fs.rmSync(dir, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "pw", port: 54999, persistent: false });
await server.initialise(); await server.start();
const mk = async () => { const c = new pg.Client({ host: "localhost", port: 54999, user: "postgres", password: "pw", database: "postgres" }); await c.connect(); return c; };
const admin = await mk();
await admin.query(fs.readFileSync(new URL("./bootstrap.sql", import.meta.url), "utf8"));
await admin.query(fs.readFileSync(`${REPO}/supabase/schema.sql`, "utf8"));
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const U = async (email) => (await admin.query("insert into auth.users(email) values($1) returning id", [email])).rows[0].id;
// run one statement as an authenticated user in its own transaction on its own connection
async function asUser(uid, sql, params = []) {
  const c = await mk();
  try {
    await c.query("begin"); await c.query("set local role authenticated"); await c.query("select set_config('request.jwt.claim.sub',$1,true)", [uid]);
    const r = await c.query(sql, params); await c.query("commit"); return { ok: true, r };
  } catch (e) { await c.query("rollback").catch(() => {}); return { ok: false, code: e.code, msg: e.message }; } finally { await c.end(); }
}
const ins = (uid, n, extra = {}) => asUser(uid, "insert into qrforge.qr_codes(user_id,name,type,fields,style) values($1,$2,$3,$4,$5) returning id", [uid, n, extra.type ?? "url", extra.fields ?? { url: "https://a.co" }, extra.style ?? {}]);
const count = async (uid) => +(await admin.query("select count(*) from qrforge.qr_codes where user_id=$1", [uid])).rows[0].count;

// ---------- A. BEFORE migration: demonstrate the race and the direct-API bypass ----------
const a = await U("a@test");
// the app's old logic: count, then insert (barrier makes all 12 read before any writes)
const appInsert = async (uid, barrier) => {
  const c = await mk(); await c.query("begin"); await c.query("set local role authenticated"); await c.query("select set_config('request.jwt.claim.sub',$1,true)", [uid]);
  const n = +(await c.query("select count(*) from qrforge.qr_codes")).rows[0].count; await barrier();
  if (n >= 3) { await c.query("rollback"); await c.end(); return false; }
  await c.query("insert into qrforge.qr_codes(user_id,name,type,fields,style) values($1,'x','url','{}','{}')", [uid]); await c.query("commit"); await c.end(); return true;
};
const mkBarrier = (n) => { let k = 0, res; const p = new Promise((r) => (res = r)); return async () => { if (++k === n) res(); await p; }; };
let b = mkBarrier(12); const before = await Promise.all(Array.from({ length: 12 }, () => appInsert(a, b)));
ok(await count(a) > 3, `BEFORE migration: 12 simultaneous count-then-insert saves stored ${await count(a)} codes on a Free limit of 3 (race reproduced)`);
const a2 = await U("a2@test"); let direct = 0; for (let i = 0; i < 6; i++) if ((await ins(a2, "d" + i)).ok) direct++;
ok(direct === 6, `BEFORE migration: direct data-API inserts bypass the limit (${direct}/6 accepted on Free)`);
const a3 = await U("a3@test");
ok((await ins(a3, "huge", { fields: { text: "x".repeat(2_000_000) } })).ok, "BEFORE migration: a 2 MB fields blob is accepted via the data API");

// ---------- apply migration ----------
await admin.query(fs.readFileSync(`${REPO}/supabase/migrations/20261014000000_atomic_limits.sql`, "utf8").replace("alter table qrforge.qr_codes add constraint qr_codes_type_check", "delete from qrforge.qr_codes where user_id in (select id from auth.users where email like 'a%@test');\nalter table qrforge.qr_codes add constraint qr_codes_type_check"));

// ---------- B. AFTER migration ----------
const f1 = await U("f1@test");
const res = await Promise.all(Array.from({ length: 20 }, (_, i) => ins(f1, "c" + i)));
ok(res.filter((r) => r.ok).length === 3 && (await count(f1)) === 3, `AFTER: 20 truly concurrent inserts on Free stored exactly ${await count(f1)} (limit 3)`);
ok(res.filter((r) => !r.ok).every((r) => r.code === "QF001"), "AFTER: rejected inserts fail with QF001 (limit) and nothing else");
// Pro: limit 100; 120 concurrent
const p1 = await U("p1@test"); await admin.query("select qrforge.apply_payment('ref_p1',$1,'pro',350000,null,null,false,30)", [p1]);
const rp = await Promise.all(Array.from({ length: 120 }, (_, i) => ins(p1, "p" + i)));
ok((await count(p1)) === 100, `AFTER: 120 concurrent inserts on Pro stored exactly ${await count(p1)} (limit 100)`);
// independence: another user is not blocked by f1
const f2 = await U("f2@test"); ok((await ins(f2, "ok")).ok, "AFTER: a different user is unaffected");
// direct bypass paths
const d1 = await U("d1@test");
ok(!(await ins(d1, "vc", { type: "vcard", fields: { firstName: "A" } })).ok, "AFTER: Free cannot store a paid type through the data API (QF002)");
ok(!(await ins(d1, "lg", { style: { logo: "data:image/png;base64,AAAA" } })).ok, "AFTER: Free cannot store a logo (QF003)");
ok(!(await ins(d1, "sz", { style: { size: 4096 } })).ok, "AFTER: Free cannot store size above 512 (QF004)");
ok(!(await ins(d1, "big", { fields: { text: "x".repeat(30000) } })).ok, "AFTER: oversize fields rejected by constraint");
ok(!(await ins(d1, "ty", { type: "evil" })).ok, "AFTER: unknown type rejected");
// cross-user write protections
const o = await U("owner@test"), v = await U("victim@test");
const mine = (await ins(o, "mine")).r.rows[0].id;
ok((await asUser(v, "select id from qrforge.qr_codes where id=$1", [mine])).r.rowCount === 0, "AFTER: another user cannot read the row");
ok((await asUser(v, "update qrforge.qr_codes set name='pwn' where id=$1 returning id", [mine])).r.rowCount === 0, "AFTER: another user cannot update the row");
ok((await asUser(v, "delete from qrforge.qr_codes where id=$1 returning id", [mine])).r.rowCount === 0, "AFTER: another user cannot delete the row");
ok(!(await asUser(o, "update qrforge.qr_codes set user_id=$2 where id=$1", [mine, v])).ok, "AFTER: owner cannot reassign user_id (column not updatable)");
ok(!(await ins(v, "forge", {})).ok === false && !(await asUser(v, "insert into qrforge.qr_codes(user_id,name,type) values($1,'f','url')", [o])).ok, "AFTER: user cannot insert a row owned by someone else");
ok(!(await asUser(o, "select authorization_code from qrforge.subscriptions")).ok, "AFTER: billing secret column not selectable by users");
ok(!(await asUser(o, "select * from qrforge.plan_limits")).ok, "AFTER: plan_limits not readable by users");
ok(!(await asUser(o, "select qrforge.apply_payment('x',$1,'pro',1,null,null,true,30)", [o])).ok, "AFTER: users cannot call apply_payment");
ok(!(await asUser(o, "insert into qrforge.subscriptions(user_id,plan,current_period_end) values($1,'business',now()+interval '1 year')", [o])).ok, "AFTER: users cannot grant themselves a subscription");

// ---------- C. apply_payment ----------
const q = await U("pay@test");
const n = 12; const refs = Array.from({ length: n }, (_, i) => `r${i}`);
const rr = await Promise.all(refs.map(async (r) => { const c = await mk(); try { return (await c.query("select qrforge.apply_payment($1,$2,'pro',350000,'AUTH_x','e@x.co',true,30)", [r, q])).rows[0].apply_payment; } finally { await c.end(); } }));
const end = (await admin.query("select current_period_end e from qrforge.subscriptions where user_id=$1", [q])).rows[0].e;
const days = Math.round((end - Date.now()) / 86400000);
ok(days === 360, `PAY: 12 concurrent distinct payments extend by exactly 12x30 days (got ${days})`);
ok((await admin.query("select count(*) c from qrforge.payments where user_id=$1", [q])).rows[0].c == 12, "PAY: 12 payment rows");
const dupe = await Promise.all(Array.from({ length: 10 }, async () => { const c = await mk(); try { return (await c.query("select qrforge.apply_payment('r0',$1,'pro',350000,null,null,false,30)", [q])).rows[0].apply_payment; } finally { await c.end(); } }));
const end2 = (await admin.query("select current_period_end e from qrforge.subscriptions where user_id=$1", [q])).rows[0].e;
ok(+end2 === +end, "PAY: 10 concurrent duplicates of one reference change nothing (idempotent)");
const sub = (await admin.query("select authorization_code a, auto_renew r from qrforge.subscriptions where user_id=$1", [q])).rows[0];
ok(sub.a === "AUTH_x" && sub.r === true, "PAY: card authorisation kept; duplicate with null auth does not erase it");
const bz = await U("biz@test"); await admin.query("select qrforge.apply_payment('b1',$1,'business',950000,null,null,true,30)", [bz]); await admin.query("select qrforge.apply_payment('b2',$1,'pro',350000,null,null,true,30)", [bz]);
ok((await admin.query("select plan from qrforge.subscriptions where user_id=$1", [bz])).rows[0].plan === "business", "PAY: pro payment does not downgrade an active business plan");
let fk; try { await admin.query("select qrforge.apply_payment('zz','00000000-0000-0000-0000-000000000000','pro',1,null,null,true,30)"); } catch (e) { fk = e.code; }
ok(fk === "23503", "PAY: unknown user_id fails with FK 23503 and leaves no payment row");
ok((await admin.query("select count(*) c from qrforge.payments where reference='zz'")).rows[0].c == 0, "PAY: failed application rolls back the payment row (no claim without entitlement)");
// expired subscription falls back to Free limit
const ex = await U("exp@test"); await admin.query("insert into qrforge.subscriptions(user_id,plan,current_period_end) values($1,'pro',now()-interval '1 day')", [ex]);
for (let i = 0; i < 3; i++) await ins(ex, "e" + i);
ok(!(await ins(ex, "e4")).ok, "EXPIRY: expired Pro is limited to the Free count");

// ---------- D. rollback ----------
await admin.query(fs.readFileSync(`${REPO}/supabase/rollback/20261014000000_atomic_limits.down.sql`, "utf8"));
const left = (await admin.query("select (select count(*) from pg_trigger where tgname='qr_codes_entitlements') t, to_regclass('qrforge.plan_limits') p, (select count(*) from pg_proc where proname in ('apply_payment','enforce_code_entitlements')) f")).rows[0];
ok(left.t == 0 && left.p === null && left.f == 0, "ROLLBACK: trigger, functions, plan_limits removed");
ok((await count(f1)) === 3 && (await count(p1)) === 100, "ROLLBACK: saved codes untouched");
ok((await ins(await U("post@test"), "after")).ok, "ROLLBACK: inserts work again");
await admin.query(fs.readFileSync(`${REPO}/supabase/migrations/20261014000000_atomic_limits.sql`, "utf8"));
ok((await admin.query("select count(*) c from qrforge.plan_limits")).rows[0].c == 3, "RE-APPLY: migration is re-runnable after rollback");
await admin.query(fs.readFileSync(`${REPO}/supabase/migrations/20261014000000_atomic_limits.sql`, "utf8"));
ok(true, "RE-APPLY: migration is idempotent when run twice");

console.log(`\n${pass} passed, ${fail} failed`);
await admin.end(); await server.stop(); process.exit(fail ? 1 : 0);
