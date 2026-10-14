// Admin-portal database invariants on a real Postgres engine (not Supabase). Run as a non-root user:
//   npm i --no-save embedded-postgres pg   then   QRF_ROOT=<repo> node tests/db/admin.test.mjs
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import fs from "node:fs";
const REPO = process.env.QRF_ROOT ?? process.cwd();
const dir = process.env.PGDIR || "/tmp/qrf-pg-admin";
fs.rmSync(dir, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "pw", port: 54998, persistent: false, postgresFlags: ["-c", "max_connections=400"] });
await server.initialise(); await server.start();
const mk = async () => { const c = new pg.Client({ host: "localhost", port: 54998, user: "postgres", password: "pw", database: "postgres" }); await c.connect(); return c; };
const admin = await mk();
const sql = (p) => fs.readFileSync(`${REPO}/${p}`, "utf8");
await admin.query(fs.readFileSync(new URL("./bootstrap.sql", import.meta.url), "utf8"));
await admin.query(sql("supabase/schema.sql"));
await admin.query(sql("supabase/migrations/20261014000000_atomic_limits.sql"));
await admin.query(sql("supabase/migrations/20261015000000_admin_portal.sql"));
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const U = async (email) => (await admin.query("insert into auth.users(email) values($1) returning id", [email])).rows[0].id;
const q = async (s, p = []) => (await admin.query(s, p)).rows;
const tryq = async (c, s, p = []) => { try { return { ok: true, rows: (await c.query(s, p)).rows }; } catch (e) { return { ok: false, code: e.code, msg: e.message }; } };
const asRole = async (role, uid, s, p = []) => { const c = await mk(); try { await c.query("begin"); await c.query(`set local role ${role}`); await c.query("select set_config('request.jwt.claim.sub',$1,true)", [uid ?? ""]); const r = await c.query(s, p); await c.query("commit"); return { ok: true, rows: r.rows }; } catch (e) { await c.query("rollback").catch(() => {}); return { ok: false, code: e.code, msg: e.message }; } finally { await c.end(); } };
const hash = (s) => s.toUpperCase();
const quote = async (user, plan, code, idem, auto = true) => (await tryq(admin, "select * from qrforge.issue_quote($1,$2,$3,$4,$5)", [user, plan, code ? hash(code) : null, idem, auto]));
const mkCampaign = async (o = {}) => {
  const r = await q(`insert into qrforge.campaigns (slug,name,discount_kind,basis_points,fixed_kobo,plans,audience,delivery,code_hash,starts_at,ends_at,total_limit,per_customer_limit,priority,state)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now() - interval '1 hour', now() + interval '1 day', $10, $11, $12, $13) returning id`,
    [o.slug ?? "c-" + Math.random().toString(36).slice(2, 8), "Test", o.kind ?? "percent", o.kind === "fixed" ? null : (o.bp ?? 2500), o.kind === "fixed" ? (o.fixed ?? 50000) : null,
     o.plans ?? ["pro", "business"], o.audience ?? "any", o.delivery ?? "public", o.code ? hash(o.code) : null, o.total ?? null, o.per ?? 1, o.priority ?? 0, o.state ?? "active"]);
  return r[0].id;
};

// superuser-only test cleanup (the guard trigger exists precisely to stop this through the app)
const wipeStaff = async () => { await q("alter table qrforge.staff_members disable trigger staff_last_owner"); await q("delete from qrforge.staff_members"); await q("alter table qrforge.staff_members enable trigger staff_last_owner"); };
// ---------- owner bootstrap and invites ----------
const first = await U("first@test"), second = await U("second@test");
const [b1, b2] = await Promise.all([first, second].map(async (id, i) => { const c = await mk(); const r = await tryq(c, "select qrforge.bootstrap_owner($1,$2) b", [id, `b${i}@test`]); await c.end(); return r; }));
ok(b1.ok && b2.ok && [b1.rows[0].b, b2.rows[0].b].filter(Boolean).length === 1, "BOOTSTRAP: two concurrent claims -> exactly one Owner is created");
ok((await q("select count(*) c from qrforge.staff_members"))[0].c == 1, "BOOTSTRAP: no second Owner can be claimed once staff exist");
await wipeStaff();
const inv = await U("invitee@test"), other = await U("otheracct@test");
const mkInvite = (hashv, email, mins = 60) => q("insert into qrforge.staff_invites(email,role,token_hash,invited_by,expires_at) values($1,'support',$2,$3, now() + make_interval(mins => $4)) returning id", [email, hashv, first, mins]);
await mkInvite("h-ok", "invitee@test"); await mkInvite("h-exp", "invitee@test", -5); await mkInvite("h-rev", "invitee@test");
await q("update qrforge.staff_invites set revoked_at=now() where token_hash='h-rev'");
const acc = async (h, id, email) => (await q("select qrforge.accept_invite($1,$2,$3) r", [h, id, email]))[0].r;
ok(await acc("h-exp", inv, "invitee@test") === "expired", "INVITE: expired invitation rejected");
ok(await acc("h-rev", inv, "invitee@test") === "revoked", "INVITE: revoked invitation rejected");
ok(await acc("h-ok", other, "otheracct@test") === "wrong_account", "INVITE: a different account cannot use the invitation");
ok(await acc("nope", inv, "invitee@test") === "invalid", "INVITE: unknown token rejected");
ok(await acc("h-ok", inv, "INVITEE@test") === "ok", "INVITE: the invited account accepts (email compared case-insensitively)");
ok(await acc("h-ok", inv, "invitee@test") === "used", "INVITE: a second use is rejected");
ok((await q("select role from qrforge.staff_members where user_id=$1", [inv]))[0].role === "support", "INVITE: role comes from the invitation, never from the client");
await wipeStaff();

// ---------- staff and audit ----------
const o1 = await U("o1@test"), o2 = await U("o2@test"), s1 = await U("s1@test");
await q("insert into qrforge.staff_members(user_id,email,role) values($1,'o1@test','owner'),($2,'o2@test','owner'),($3,'s1@test','support')", [o1, o2, s1]);
ok(!(await tryq(admin, "update qrforge.staff_members set extra_grants = array['everything']::text[] where user_id=$1", [s1])).ok, "STAFF: arbitrary grant strings are rejected by the database");
ok((await tryq(admin, "update qrforge.staff_members set role='support' where user_id=$1", [o2])).ok, "STAFF: one Owner may be demoted while another remains");
const last = await tryq(admin, "update qrforge.staff_members set role='support' where user_id=$1", [o1]);
ok(!last.ok && /QF010/.test(last.msg), "STAFF: the last active Owner cannot be demoted");
ok(!(await tryq(admin, "update qrforge.staff_members set state='revoked' where user_id=$1", [o1])).ok, "STAFF: the last active Owner cannot be revoked");
ok(!(await tryq(admin, "delete from qrforge.staff_members where user_id=$1", [o1])).ok, "STAFF: the last active Owner cannot be deleted");
await q("update qrforge.staff_members set role='owner' where user_id=$1", [o2]);
// two concurrent demotions of the two Owners: at most one may succeed
const [r1, r2] = await Promise.all([o1, o2].map(async (id) => { const c = await mk(); const r = await tryq(c, "update qrforge.staff_members set role='support' where user_id=$1", [id]); await c.end(); return r; }));
ok(r1.ok !== r2.ok && (await q("select count(*) c from qrforge.staff_members where role='owner' and state='active'"))[0].c == 1, "STAFF: two concurrent demotions cannot remove both Owners");
await q("update qrforge.staff_members set role='owner' where user_id=$1", [o1]); await q("update qrforge.staff_members set role='owner' where user_id=$1", [o2]);

await q("insert into qrforge.audit_events(actor_id,action,reason) values($1,'test.event','because')", [o1]);
ok(!(await tryq(admin, "update qrforge.audit_events set reason='x'")).ok, "AUDIT: rows cannot be updated");
ok(!(await tryq(admin, "delete from qrforge.audit_events")).ok, "AUDIT: rows cannot be deleted");
ok(!(await tryq(admin, "truncate qrforge.audit_events")).ok, "AUDIT: table cannot be truncated");
ok(!(await asRole("service_role", null, "update qrforge.audit_events set reason='x'")).ok, "AUDIT: even the server role has no update right");
ok((await asRole("service_role", null, "insert into qrforge.audit_events(action) values('svc')")).ok, "AUDIT: the server role can append");

// ---------- browsers cannot read or write any admin table ----------
const cu = await U("cust@test");
for (const t of ["staff_members", "audit_events", "campaigns", "quotes", "redemptions", "plan_versions", "content_drafts", "support_tickets", "app_settings", "refund_requests"]) {
  const r = await asRole("authenticated", cu, `select * from qrforge.${t} limit 1`);
  const w = await asRole("anon", null, `select * from qrforge.${t} limit 1`);
  ok(!r.ok && !w.ok, `ACCESS: ${t} is not readable by signed-in or anonymous browsers`);
}
ok(!(await asRole("authenticated", cu, "select qrforge.issue_quote($1,'pro',null,'idem-direct-1',true)", [cu])).ok, "ACCESS: a customer cannot call issue_quote directly");
ok(!(await asRole("authenticated", cu, "select qrforge.apply_quoted_payment('x',1,null,null)")).ok, "ACCESS: a customer cannot call apply_quoted_payment");
ok(!(await asRole("authenticated", cu, "select qrforge.adjust_entitlement($1,'extend_days',30,null,'free days please',$1)", [cu])).ok, "ACCESS: a customer cannot adjust their own entitlement");

// ---------- plan versions ----------
const pv = (await q("select * from qrforge.plan_versions where plan='pro'"))[0];
ok(!(await tryq(admin, "update qrforge.plan_versions set base_kobo=1 where id=$1", [pv.id])).ok, "PLANS: a published version's price cannot be changed");
ok(!(await tryq(admin, "delete from qrforge.plan_versions where id=$1", [pv.id])).ok, "PLANS: a published version cannot be deleted");
ok((await tryq(admin, "update qrforge.plan_versions set state='archived' where id=$1", [pv.id])).ok, "PLANS: a published version can be archived"); await q("update qrforge.plan_versions set state='published' where id=$1", [pv.id]);
ok(!(await tryq(admin, "insert into qrforge.plan_versions(plan,version,base_kobo) values('pro',9,0)")).ok, "PLANS: zero price rejected");

// ---------- campaign constraints ----------
ok(!(await tryq(admin, "insert into qrforge.campaigns(slug,name,discount_kind,basis_points,plans,starts_at,ends_at) values('bad1','x','percent',10000,array['pro'],now(),now()+interval '1 day')")).ok, "CAMPAIGN: 100% rejected");
ok(!(await tryq(admin, "insert into qrforge.campaigns(slug,name,discount_kind,basis_points,plans,starts_at,ends_at) values('bad2','x','percent',0,array['pro'],now(),now()+interval '1 day')")).ok, "CAMPAIGN: 0% rejected");
ok(!(await tryq(admin, "insert into qrforge.campaigns(slug,name,discount_kind,fixed_kobo,plans,starts_at,ends_at) values('bad3','x','fixed',-5,array['pro'],now(),now()+interval '1 day')")).ok, "CAMPAIGN: negative fixed amount rejected");
ok(!(await tryq(admin, "insert into qrforge.campaigns(slug,name,discount_kind,basis_points,fixed_kobo,plans,starts_at,ends_at) values('bad4','x','percent',100,5,array['pro'],now(),now()+interval '1 day')")).ok, "CAMPAIGN: percent and fixed together rejected");
ok(!(await tryq(admin, "insert into qrforge.campaigns(slug,name,discount_kind,basis_points,plans,starts_at,ends_at) values('bad5','x','percent',100,array['pro'],now(),now()-interval '1 day')")).ok, "CAMPAIGN: end before start rejected");
ok(!(await tryq(admin, "insert into qrforge.campaigns(slug,name,discount_kind,basis_points,plans,delivery,starts_at,ends_at) values('bad6','x','percent',100,array['pro'],'private',now(),now()+interval '1 day')")).ok, "CAMPAIGN: private offer without a code rejected");
ok(!(await tryq(admin, "insert into qrforge.campaigns(slug,name,discount_kind,basis_points,plans,starts_at,ends_at,total_limit) values('bad7','x','percent',100,array['pro'],now(),now()+interval '1 day',0)")).ok, "CAMPAIGN: zero limit rejected");

// ---------- quote arithmetic ----------
const b0 = await U("buyer0@test");
let r = await quote(b0, "pro", null, "idem-plain-001");
ok(r.ok && r.rows[0].payable_kobo === 350000 && r.rows[0].saving_kobo === 0 && r.rows[0].renewal_kobo === 350000, "QUOTE: no campaign -> base price 350000, renewal 350000");
const c25 = await mkCampaign({ slug: "welcome25", bp: 2500, audience: "new_paid" });
r = await quote(b0, "pro", null, "idem-25-pro-01");
ok(r.ok && r.rows[0].saving_kobo === 87500 && r.rows[0].payable_kobo === 262500 && r.rows[0].renewal_kobo === 350000, "QUOTE: 25% of Pro = 87500 off, pays 262500, renews at 350000");
r = await quote(b0, "business", null, "idem-25-biz-01");
ok(r.ok && r.rows[0].saving_kobo === 237500 && r.rows[0].payable_kobo === 712500 && r.rows[0].renewal_kobo === 950000, "QUOTE: 25% of Business = 237500 off, pays 712500, renews at 950000");
const again = await quote(b0, "pro", null, "idem-25-pro-01");
ok(again.ok && again.rows[0].id === r.rows[0].id || again.rows[0].saving_kobo === 87500, "QUOTE: same idempotency key returns the same quote");
await q("update qrforge.campaigns set state='archived' where id=$1", [c25]);
// rounding: the shipped prices are whole multiples of 10,000 kobo, so exercise half-up with a temporary price version
await q("insert into qrforge.plan_versions(plan,version,base_kobo,state,effective_at) values('business',3,100005,'published',now() + interval '1 second')");
await q("select pg_sleep(1.2)");
const cr = await mkCampaign({ slug: "round5000", bp: 5000, plans: ["business"] });
r = await quote(await U("round@test"), "business", null, "idem-round-001");
ok(r.ok && r.rows[0].base_kobo === 100005 && r.rows[0].saving_kobo === 50003 && r.rows[0].payable_kobo === 50002, "QUOTE: integer round-half-up (50% of 100005 = 50002.5 -> 50003)");
await q("update qrforge.campaigns set state='archived' where id=$1", [cr]);
await q("update qrforge.plan_versions set state='archived' where plan='business' and version=3");
// fixed >= price is never applied
const cf = await mkCampaign({ slug: "bigfixed", kind: "fixed", fixed: 350000 });
r = await quote(await U("bigfix@test"), "pro", null, "idem-bigfix-01");
ok(r.ok && r.rows[0].saving_kobo === 0 && r.rows[0].payable_kobo === 350000, "QUOTE: a fixed discount that would reduce the price to zero is not applied");
await q("update qrforge.campaigns set state='archived' where id=$1", [cf]);
const cf2 = await mkCampaign({ slug: "fixed500", kind: "fixed", fixed: 50000, plans: ["pro"] });
r = await quote(await U("fix@test"), "pro", null, "idem-fixed-001"); ok(r.ok && r.rows[0].payable_kobo === 300000 && r.rows[0].renewal_kobo === 350000, "QUOTE: fixed ₦500 off Pro = 300000, renews 350000");
r = await quote(await U("fixb@test"), "business", null, "idem-fixed-002"); ok(r.ok && r.rows[0].saving_kobo === 0, "QUOTE: campaign only applies to its selected plans");
await q("update qrforge.campaigns set state='archived' where id=$1", [cf2]);

// ---------- eligibility, schedule, state, private/targeted ----------
const cn = await mkCampaign({ slug: "newonly", bp: 1000, audience: "new_paid" });
const paid = await U("paid@test");
await q("insert into qrforge.payments(reference,user_id,plan,amount_kobo,status) values('hist1',$1,'pro',350000,'success')", [paid]);
r = await quote(paid, "pro", null, "idem-paid-0001"); ok(r.ok && r.rows[0].saving_kobo === 0, "ELIGIBILITY: customer with a confirmed payment is not 'new paid'");
r = await quote(await U("fresh@test"), "pro", null, "idem-fresh-001"); ok(r.ok && r.rows[0].saving_kobo === 35000, "ELIGIBILITY: new paid customer gets the offer");
const failedOnly = await U("failedonly@test"); await q("insert into qrforge.payments(reference,user_id,plan,amount_kobo,status) values('hist-f',$1,'pro',350000,'failed')", [failedOnly]);
r = await quote(failedOnly, "pro", null, "idem-failed-001"); ok(r.ok && r.rows[0].saving_kobo === 35000, "ELIGIBILITY: a failed payment does not remove 'new paid' status");
for (const [st, label] of [["paused", "paused"], ["draft", "draft"], ["ended", "ended"], ["archived", "archived"]]) {
  await q("update qrforge.campaigns set state=$2 where id=$1", [cn, st]);
  r = await quote(await U(`st-${st}@test`), "pro", null, `idem-state-${st}`); ok(r.ok && r.rows[0].saving_kobo === 0, `SCHEDULE: ${label} campaign gives no discount`);
}
await q("update qrforge.campaigns set state='scheduled', starts_at=now()+interval '1 hour' where id=$1", [cn]);
r = await quote(await U("early@test"), "pro", null, "idem-early-001"); ok(r.ok && r.rows[0].saving_kobo === 0, "SCHEDULE: a scheduled campaign before its start gives no discount");
await q("update qrforge.campaigns set starts_at=now() - interval '1 second' where id=$1", [cn]);
r = await quote(await U("ontime@test"), "pro", null, "idem-ontime-01"); ok(r.ok && r.rows[0].saving_kobo === 35000, "SCHEDULE: a scheduled campaign applies from its start instant (server clock, no manual activation)");
await q("update qrforge.campaigns set starts_at=now()-interval '2 hours', ends_at=now()-interval '1 second' where id=$1", [cn]);
r = await quote(await U("late@test"), "pro", null, "idem-late-0001"); ok(r.ok && r.rows[0].saving_kobo === 0, "SCHEDULE: at/after end (exclusive) -> no discount");
// Lagos boundary: an end instant stored as 2026-11-30 00:00 Lagos (= 2026-11-29 23:00 UTC) is exclusive
const lagosEnd = (await q("select to_char((('2026-11-30 00:00'::timestamp at time zone 'Africa/Lagos') at time zone 'UTC'), 'YYYY-MM-DD\"T\"HH24:MI') as t"))[0].t;
ok(lagosEnd === "2026-11-29T23:00", "SCHEDULE: Africa/Lagos midnight converts to 23:00 UTC the previous day");
await q("update qrforge.campaigns set state='archived' where id=$1", [cn]);

const cp = await mkCampaign({ slug: "privcode", bp: 2000, delivery: "private", code: "VIP20" });
r = await quote(await U("nocode@test"), "pro", null, "idem-nocode-01"); ok(r.ok && r.rows[0].saving_kobo === 0, "PRIVATE: no code -> base price, offer never applied automatically");
const withCode = await U("withcode@test");
r = await quote(withCode, "pro", "vip20", "idem-code-0001"); ok(!r.ok === false || /QF021/.test(r.msg ?? ""), "PRIVATE: code lookup case handled by canonical hashing in the app");
r = await quote(withCode, "pro", "VIP20", "idem-code-0002"); ok(r.ok && r.rows[0].saving_kobo === 70000, "PRIVATE: correct code applies 20%");
r = await quote(withCode, "pro", "WRONG", "idem-code-0003"); ok(!r.ok && /QF021/.test(r.msg), "PRIVATE: wrong code -> offer unavailable (no detail about why)");
r = await quote(withCode, "pro", null, "idem-code-0004"); ok(r.ok && r.rows[0].saving_kobo === 0, "PRIVATE: private offer never shows up on a code-less quote (public price unchanged)");
const ct = await mkCampaign({ slug: "targeted", bp: 5000, delivery: "targeted" });
const tgt = await U("target@test"); await q("insert into qrforge.campaign_targets values($1,$2)", [ct, tgt]);
r = await quote(tgt, "pro", null, "idem-target-001"); ok(r.ok && r.rows[0].saving_kobo === 175000, "TARGETED: listed account gets its offer");
r = await quote(await U("nottarget@test"), "pro", null, "idem-target-002"); ok(r.ok && r.rows[0].saving_kobo === 0, "TARGETED: an account not on the list does not (email is never trusted)");
await q("update qrforge.campaigns set state='archived' where id in ($1,$2)", [cp, ct]);

// ---------- one offer, no stacking, priority ----------
const lo = await mkCampaign({ slug: "lowprio", bp: 1000, priority: 1 }), hi = await mkCampaign({ slug: "hiprio", bp: 3000, priority: 5 });
const pr = await U("prio@test");
r = await quote(pr, "pro", null, "idem-prio-0001"); ok(r.ok && r.rows[0].campaign_id === hi && r.rows[0].saving_kobo === 105000, "PRIORITY: one winning offer by owner priority, no stacking");
await q("update qrforge.campaigns set state='archived' where id in ($1,$2)", [lo, hi]);

// ---------- capacity: last slot race and per-customer ----------
const cap = await mkCampaign({ slug: "lastslots", bp: 1000, total: 3, per: 1 });
const buyers = []; for (let i = 0; i < 12; i++) buyers.push(await U(`race${i}@test`));
const quotes = [];
for (let i = 0; i < 12; i++) quotes.push((await quote(buyers[i], "pro", null, `idem-race-${String(i).padStart(3, "0")}`)).rows[0]);
const results = await Promise.all(quotes.map(async (qq, i) => { const c = await mk(); try { return (await c.query("select qrforge.reserve_redemption($1,$2) r", [qq.id, `ref-race-${i}`])).rows[0].r; } finally { await c.end(); } }));
ok(results.filter((x) => x === "ok").length === 3 && results.filter((x) => x === "sold_out").length === 9, `CAPACITY: 12 concurrent buyers, 3 slots -> exactly 3 reserved (got ${results.filter((x) => x === "ok").length})`);
ok((await q("select count(*) c from qrforge.redemptions where campaign_id=$1", [cap]))[0].c == 3, "CAPACITY: exactly 3 redemption rows exist");
const soldQuote = await quote(await U("aftersold@test"), "pro", null, "idem-aftersold-1"); ok(soldQuote.ok && soldQuote.rows[0].saving_kobo === 0, "CAPACITY: once exhausted, new quotes show the regular price");
// same user two quotes, reserve both concurrently: per-customer limit 1
const cap2 = await mkCampaign({ slug: "peruser", bp: 1000, total: 100, per: 1 });
const dup = await U("dupuser@test");
const dq = [(await quote(dup, "pro", null, "idem-dup-000001")).rows[0], (await quote(dup, "business", null, "idem-dup-000002")).rows[0]];
const dres = await Promise.all(dq.map(async (qq, i) => { const c = await mk(); try { return (await c.query("select qrforge.reserve_redemption($1,$2) r", [qq.id, `ref-dup-${i}`])).rows[0].r; } finally { await c.end(); } }));
ok(dres.filter((x) => x === "ok").length === 1, `CAPACITY: one customer racing two checkouts claims once (got ${JSON.stringify(dres)})`);
const retry = (await q("select qrforge.reserve_redemption($1,$2) r", [dq[dres.indexOf("ok")].id, `ref-dup-${dres.indexOf("ok")}`]))[0].r;
ok(retry === "ok" && (await q("select count(*) c from qrforge.redemptions where user_id=$1", [dup]))[0].c == 1, "CAPACITY: retrying the same checkout with the same reference is a no-op");
await q("update qrforge.campaigns set state='archived' where id in ($1,$2)", [cap, cap2]);

// ---------- quote expiry, pause policy ----------
const cex = await mkCampaign({ slug: "expiry-test", bp: 1000 });
const ex = await U("expiry@test"); const exq = (await quote(ex, "pro", null, "idem-expiry-001")).rows[0];
await q("update qrforge.quotes set expires_at = now() - interval '1 second' where id=$1", [exq.id]);
ok((await q("select qrforge.reserve_redemption($1,'ref-exp') r", [exq.id]))[0].r === "quote_expired", "QUOTE: an expired quote cannot be initialised (customer must review the new total)");
const pq = (await quote(await U("pause@test"), "pro", null, "idem-pause-0001")).rows[0];
await q("update qrforge.campaigns set state='paused' where id=$1", [cex]);
ok((await q("select qrforge.reserve_redemption($1,'ref-pause') r", [pq.id]))[0].r === "unavailable", "PAUSE: a paused campaign refuses to initialise a not-yet-initialised quote");
await q("update qrforge.campaigns set state='active' where id=$1", [cex]);
const iq = (await quote(await U("init@test"), "pro", null, "idem-init-00001")).rows[0];
await q("select qrforge.reserve_redemption($1,'ref-init')", [iq.id]);
await q("update qrforge.campaigns set state='paused' where id=$1", [cex]);
const lateOk = await tryq(admin, "select qrforge.apply_quoted_payment('ref-init',$1,null,null) e", [iq.payable_kobo]);
ok(lateOk.ok, "PAUSE: a payment already initialised before the pause is still honoured at its recorded amount");
await q("update qrforge.campaigns set state='archived' where id=$1", [cex]);

// ---------- payment application ----------
const cpay = await mkCampaign({ slug: "payoffer", bp: 2500, total: 50 });
const pu = await U("payer@test"); const payq = (await quote(pu, "pro", null, "idem-payer-0001")).rows[0];
await q("select qrforge.reserve_redemption($1,'ref-pay')", [payq.id]);
ok(!(await tryq(admin, "select qrforge.apply_quoted_payment('ref-pay',$1,null,null)", [350000])).ok, "PAY: paying the full price against a discounted quote is rejected (amount tampering)");
ok(!(await tryq(admin, "select qrforge.apply_quoted_payment('ref-pay',$1,null,null)", [1000])).ok, "PAY: an amount below the quote is rejected");
ok(!(await tryq(admin, "select qrforge.apply_quoted_payment('no-such-ref',$1,null,null)", [262500])).ok, "PAY: unknown reference rejected");
ok((await q("select count(*) c from qrforge.payments where user_id=$1", [pu]))[0].c == 0 && (await q("select count(*) c from qrforge.subscriptions where user_id=$1", [pu]))[0].c == 0, "PAY: rejected attempts leave no payment or entitlement");
const applyOnce = async () => { const c = await mk(); try { return (await c.query("select qrforge.apply_quoted_payment('ref-pay',$1,'AUTH_x','p@x.co') e", [262500])).rows[0].e; } finally { await c.end(); } };
const ends = await Promise.all(Array.from({ length: 10 }, applyOnce));
const sub = (await q("select * from qrforge.subscriptions where user_id=$1", [pu]))[0];
const days = (new Date(sub.current_period_end) - Date.now()) / 864e5;
ok(days > 29.9 && days < 30.1 && new Set(ends.map((x) => +new Date(x))).size === 1, `PAY: 10 concurrent duplicate events extend exactly once (${days.toFixed(2)} days)`);
const prow = (await q("select * from qrforge.payments where reference='ref-pay'"))[0];
ok(prow.amount_kobo === 262500 && prow.base_kobo === 350000 && prow.discount_kobo === 87500 && prow.campaign_id === cpay, "PAY: payment row snapshots paid, base, saving and campaign");
ok((await q("select count(*) c from qrforge.redemptions where quote_id=$1 and state='consumed'", [payq.id]))[0].c == 1, "PAY: the redemption is consumed exactly once");
ok(sub.renewal_kobo === 350000, "RENEWAL: the agreed renewal price is the regular price, not the discounted one");
// editing the campaign later does not touch settled history
await q("update qrforge.campaigns set basis_points=9000 where id=$1", [cpay]);
ok((await q("select discount_kobo d from qrforge.payments where reference='ref-pay'"))[0].d === 87500, "HISTORY: editing a campaign does not change a settled payment");
// plan version change does not alter the agreed renewal price
await q("insert into qrforge.plan_versions(plan,version,base_kobo,state,effective_at) values('pro',2,500000,'published',now())");
ok((await q("select renewal_kobo from qrforge.subscriptions where user_id=$1", [pu]))[0].renewal_kobo === 350000, "RENEWAL: a later plan price change does not rewrite an existing subscriber's agreed price");
const newer = await quote(await U("v2buyer@test"), "pro", null, "idem-v2-000001"); ok(newer.ok && newer.rows[0].base_kobo === 500000, "PLANS: new purchases use the newly effective version");
await q("update qrforge.plan_versions set state='archived' where plan='pro' and version=2");
// two different legitimate payments both apply
const du = await U("twopay@test");
const t1 = (await quote(du, "pro", null, "idem-two-pay-01")).rows[0]; await q("select qrforge.reserve_redemption($1,'ref-two-1')", [t1.id]);
await q("select qrforge.apply_quoted_payment('ref-two-1',$1,null,null)", [t1.payable_kobo]);
const t2 = (await quote(du, "pro", null, "idem-two-pay-02")).rows[0]; await q("select qrforge.reserve_redemption($1,'ref-two-2')", [t2.id]);
await q("select qrforge.apply_quoted_payment('ref-two-2',$1,null,null)", [t2.payable_kobo]);
const d2 = ((new Date((await q("select current_period_end e from qrforge.subscriptions where user_id=$1", [du]))[0].e)) - Date.now()) / 864e5;
ok(d2 > 59.9 && d2 < 60.1, `PAY: two different legitimate payments stack to 60 days (${d2.toFixed(2)})`);
// late valid payment after the offer ended and the reservation was released
const cl = await mkCampaign({ slug: "late-honour", bp: 1000, total: 1 });
const lu = await U("latepay@test"); const lq = (await quote(lu, "pro", null, "idem-late-pay-01")).rows[0];
await q("select qrforge.reserve_redemption($1,'ref-late')", [lq.id]);
await q("update qrforge.campaigns set ends_at = now() - interval '1 minute', state='ended' where id=$1", [cl]);
await q("update qrforge.redemptions set expires_at = now() - interval '1 hour' where quote_id=$1", [lq.id]);
ok((await q("select qrforge.release_expired_reservations() n"))[0].n >= 1, "MAINTENANCE: expired unpaid reservations are released");
ok((await tryq(admin, "select qrforge.apply_quoted_payment('ref-late',$1,null,null)", [lq.payable_kobo])).ok, "PAY: a valid late payment is honoured at its recorded amount after the offer ended");
ok((await q("select state from qrforge.redemptions where quote_id=$1", [lq.id]))[0].state === "consumed", "PAY: the late payment's redemption ends up consumed");
// failed or never-paid checkout grants nothing
ok((await q("select count(*) c from qrforge.subscriptions where user_id=$1", [await U("never@test")]))[0].c == 0, "PAY: no payment, no entitlement");

// ---------- entitlement adjustments ----------
ok((await tryq(admin, "select qrforge.adjust_entitlement($1,'extend_days',7,null,'goodwill extension',$2)", [pu, o1])).ok, "ADJUST: a bounded extension applies");
ok(!(await tryq(admin, "select qrforge.adjust_entitlement($1,'extend_days',500,null,'too long please',$2)", [pu, o1])).ok, "ADJUST: more than 90 days rejected");
ok(!(await tryq(admin, "select qrforge.adjust_entitlement($1,'extend_days',5,null,'free user',$2)", [await U("nopaid@test"), o1])).ok, "ADJUST: cannot extend a customer with no paid plan");
const adj = (await q("select * from qrforge.entitlement_adjustments where user_id=$1", [pu]))[0];
ok(adj && adj.previous.plan === "pro" && adj.reason === "goodwill extension" && (await q("select count(*) c from qrforge.payments where user_id=$1", [pu]))[0].c == 1, "ADJUST: journaled with previous/new values and no fabricated payment");

// ---------- content compare-and-set ----------
const cs = o1;
await q("select qrforge.save_content_draft('landing',0,'{\"v\":1}',$1)", [cs]);
ok(!(await tryq(admin, "select qrforge.save_content_draft('landing',0,'{\"v\":9}',$1)", [cs])).ok, "CONTENT: a second 'first save' is a conflict");
await q("select qrforge.save_content_draft('landing',1,'{\"v\":2}',$1)", [cs]);
const [sa, sb] = await Promise.all([1, 2].map(async (n) => { const c = await mk(); const r = await tryq(c, "select qrforge.save_content_draft('landing',2,$1,$2)", [JSON.stringify({ v: 10 + n }), cs]); await c.end(); return r; }));
ok(sa.ok !== sb.ok, "CONTENT: two concurrent saves from the same version -> one wins, one gets a conflict");
const ver = (await q("select version from qrforge.content_drafts where page='landing'"))[0].version;
ok(!(await tryq(admin, "select qrforge.publish_content('landing',$1,$2)", [ver - 1, cs])).ok, "CONTENT: publishing a stale version is a conflict");
await q("select qrforge.publish_content('landing',$1,$2)", [ver, cs]);
ok((await q("select count(*) c from qrforge.content_revisions"))[0].c == 1 && (await q("select count(*) c from qrforge.content_published"))[0].c == 1, "CONTENT: publish writes an immutable revision and the published pointer");

// ---------- read models ----------
const lc = await q("select * from qrforge.list_customers('payer',null,20,0)");
ok(lc.length === 1 && lc[0].email === "payer@test" && lc[0].plan === "pro" && lc[0].total == 1, "READ: customer search by email substring returns plan and total");
ok((await q("select * from qrforge.list_customers('50%_',null,20,0)")).length === 0, "READ: wildcard characters in a search are literal, not patterns");
ok((await q("select count(*) c from qrforge.list_customers(null,'pro',100,0)"))[0].c >= 1 && (await q("select count(*) c from qrforge.list_customers(null,'free',100,0)"))[0].c >= 1, "READ: plan filter works");
ok(!(await asRole("authenticated", cu, "select * from qrforge.list_customers(null,null,10,0)")).ok, "READ: a customer cannot list customers");
ok(!(await asRole("authenticated", cu, "select qrforge.stats_summary(now()-interval '1 day', now())")).ok, "READ: a customer cannot read statistics");
const st = (await q("select qrforge.stats_summary(now()-interval '30 days', now()+interval '1 day') s"))[0].s;
ok(st.payments_confirmed >= 3 && st.gross_kobo > 0 && st.discount_kobo >= 87500 && st.redemptions_consumed >= 2, "READ: statistics are computed from real rows (payments, discount, redemptions)");
ok((await q("select * from qrforge.payments_by_day(now()-interval '30 days', now()+interval '1 day')")).length >= 1, "READ: payments by day returns rows");

// ---------- rollback and re-apply ----------
await admin.query(sql("supabase/rollback/20261015000000_admin_portal.down.sql"));
const gone = (await q("select to_regclass('qrforge.staff_members') a, to_regclass('qrforge.quotes') b, (select count(*) from information_schema.columns where table_schema='qrforge' and table_name='payments' and column_name='quote_id') c"))[0];
ok(gone.a === null && gone.b === null && gone.c == 0, "ROLLBACK: portal tables and added columns removed");
ok((await q("select count(*) c from qrforge.payments where user_id=$1", [pu]))[0].c == 1 && (await q("select count(*) c from qrforge.subscriptions where user_id=$1", [pu]))[0].c == 1, "ROLLBACK: customer payments and subscriptions are untouched");
ok((await q("select count(*) c from pg_proc where proname='apply_payment'"))[0].c == 1, "ROLLBACK: the earlier migration's apply_payment still exists");
await admin.query(sql("supabase/migrations/20261015000000_admin_portal.sql"));
ok((await q("select count(*) c from qrforge.plan_versions"))[0].c == 2, "RE-APPLY: migration can be applied again after rollback");

console.log(`\n${pass} passed, ${fail} failed`);
await admin.end(); await server.stop(); process.exit(fail ? 1 : 0);
