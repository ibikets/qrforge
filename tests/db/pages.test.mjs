// Hosted pages: migration, quotas under concurrency, publish atomicity, tombstones, tenant isolation, rollback.
// Real Postgres engine (embedded), NOT Supabase. Run via the same harness as limits.test.mjs.
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import fs from "node:fs";
const REPO = process.env.QRF_ROOT ?? process.cwd();
const dir = process.env.PGDIR || "/tmp/qrf-pg2";
fs.rmSync(dir, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "pw", port: 54997, persistent: false, postgresFlags: ["-c", "max_connections=400"] });
await server.initialise(); await server.start();
const mk = async () => { const c = new pg.Client({ host: "localhost", port: 54997, user: "postgres", password: "pw", database: "postgres" }); await c.connect(); return c; };
const admin = await mk();
await admin.query(fs.readFileSync(new URL("./bootstrap.sql", import.meta.url), "utf8"));
await admin.query(fs.readFileSync(`${REPO}/supabase/schema.sql`, "utf8"));
await admin.query(fs.readFileSync(`${REPO}/supabase/migrations/20261014000000_atomic_limits.sql`, "utf8"));
await admin.query("insert into qrforge.qr_codes(user_id,name,type) select id,'keep','url' from (select gen_random_uuid() id) s where false");
const mig = fs.readFileSync(`${REPO}/supabase/migrations/20261016000000_hosted_pages.sql`, "utf8");
await admin.query(mig);
await admin.query(mig); // idempotent
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const U = async (e) => (await admin.query("insert into auth.users(email) values($1) returning id", [e])).rows[0].id;
const pro = async (u) => admin.query("select qrforge.apply_payment($1,$2,'pro',350000,null,null,false,30)", ["r" + Math.random(), u]);
const alpha = "abcdefghjkmnpqrstuvwxyz23456789";
const pid = () => Array.from({ length: 10 }, () => alpha[Math.floor(Math.random() * alpha.length)]).join("");
const raw = async (sql, p = []) => { const c = await mk(); try { return { ok: true, r: await c.query(sql, p) }; } catch (e) { return { ok: false, code: e.code, msg: e.message }; } finally { await c.end(); } };
const mkPage = (u, title = "Card") => raw("insert into qrforge.pages(user_id,kind,title,public_id,draft) values($1,'card',$2,$3,'{\"name\":\"A\"}') returning id", [u, title, pid()]);
async function asUser(uid, sql, p = []) {
  const c = await mk();
  try { await c.query("begin"); await c.query("set local role authenticated"); await c.query("select set_config('request.jwt.claim.sub',$1,true)", [uid]); const r = await c.query(sql, p); await c.query("commit"); return { ok: true, r }; }
  catch (e) { return { ok: false, code: e.code }; } finally { await c.end(); }
}

// plan limits
const lim = Object.fromEntries((await admin.query("select plan,max_pages,max_media_bytes from qrforge.plan_limits")).rows.map((r) => [r.plan, r]));
ok(lim.free.max_pages == 0 && lim.pro.max_pages == 5 && lim.business.max_pages == 25, "LIMITS: free 0 / pro 5 / business 25 hosted pages");
ok((await admin.query("select max_saved,max_size from qrforge.plan_limits where plan='pro'")).rows[0].max_saved == 100, "LIMITS: existing saved-code limits unchanged");

// quota
const free = await U("free@t");
const rf = await mkPage(free);
ok(!rf.ok && rf.code === "QF010", "QUOTA: Free cannot create a hosted page (QF010)");
const p = await U("pro@t"); await pro(p);
const res = await Promise.all(Array.from({ length: 20 }, () => mkPage(p)));
ok(res.filter((r) => r.ok).length === 5, `QUOTA: 20 concurrent creates on Pro stored exactly ${res.filter((r) => r.ok).length} (limit 5)`);
ok(res.filter((r) => !r.ok).every((r) => r.code === "QF010"), "QUOTA: rejections are QF010 only");
const other = await U("pro2@t"); await pro(other);
ok((await mkPage(other)).ok, "QUOTA: another user unaffected");
// deleted pages free quota but keep tombstone
const pages = (await admin.query("select id, public_id from qrforge.pages where user_id=$1", [p])).rows;
await admin.query("update qrforge.pages set lifecycle='deleted', deleted_at=now() where id=$1", [pages[0].id]);
ok((await mkPage(p)).ok, "QUOTA: deleting a page frees a slot");
const dup = await raw("insert into qrforge.pages(user_id,kind,title,public_id,draft) values($1,'card','x',$2,'{}')", [other, pages[0].public_id]);
ok(!dup.ok && dup.code === "23505", "TOMBSTONE: a deleted page's public id can never be reused");
ok(!(await raw("insert into qrforge.pages(user_id,kind,title,public_id,draft) values($1,'card','x','BAD-ID',  '{}')", [other])).ok, "SHAPE: malformed public id rejected");
ok(!(await raw("insert into qrforge.pages(user_id,kind,title,public_id,draft) values($1,'card','x',$2,$3)", [other, pid(), JSON.stringify({ a: "x".repeat(31000) })])).ok, "SHAPE: oversize draft rejected by constraint");

// publish atomicity + conflicts
const live = pages[1].id;
const pub = (v, content = { name: "N" }, user = p) => raw("select qrforge.publish_page($1,$2,$3,$4)", [live, user, v, content]);
const r1 = await pub(1); ok(r1.ok && r1.r.rows[0].publish_page === 1, "PUBLISH: first publish is revision 1");
const row = (await admin.query("select lifecycle,published_version from qrforge.pages where id=$1", [live])).rows[0];
ok(row.lifecycle === "published" && row.published_version === 1, "PUBLISH: lifecycle and pointer set together");
await admin.query("update qrforge.pages set draft_version=2 where id=$1", [live]);
const stale = await pub(1); ok(!stale.ok && stale.code === "QF023", "CONFLICT: publishing a stale draft version is refused (QF023)");
const conc = await Promise.all(Array.from({ length: 10 }, () => pub(2)));
const okN = conc.filter((r) => r.ok).length; const vs = conc.filter((r) => r.ok).map((r) => r.r.rows[0].publish_page).sort((a, b) => a - b);
ok(okN === 10 && new Set(vs).size === 10 && vs[0] === 2 && vs[9] === 11, `PUBLISH: 10 concurrent publishes got distinct consecutive revisions (${vs.join(",")})`);
ok((await admin.query("select published_version v from qrforge.pages where id=$1", [live])).rows[0].v === 11, "PUBLISH: pointer ends on the highest revision");
ok((await admin.query("select count(*) c from qrforge.page_revisions where page_id=$1", [live])).rows[0].c == 11, "PUBLISH: revisions retained");
ok(!(await pub(2, { name: "N" }, other)).ok && (await pub(2, {}, other)).code === "QF020", "ISOLATION: another user cannot publish my page (QF020)");
await admin.query("update qrforge.pages set taken_down_at=now() where id=$1", [live]);
ok((await pub(2)).code === "QF022", "TAKEDOWN: a taken-down page cannot be republished");
await admin.query("update qrforge.pages set taken_down_at=null where id=$1", [live]);
await admin.query("update qrforge.pages set lifecycle='archived' where id=$1", [live]);
ok((await pub(2)).code === "QF021", "LIFECYCLE: archived page cannot be published");
await admin.query("update qrforge.pages set lifecycle='published' where id=$1", [live]);
// plan lapse: publishing blocked, existing data kept
await admin.query("update qrforge.subscriptions set current_period_end = now() - interval '1 day' where user_id=$1", [p]);
ok((await pub(2)).code === "QF024", "LAPSE: publishing needs an active plan with hosted pages (QF024)");
ok((await admin.query("select lifecycle from qrforge.pages where id=$1", [live])).rows[0].lifecycle === "published", "LAPSE: existing published page is not altered by the database");
ok(!(await mkPage(p)).ok, "LAPSE: cannot create more pages while lapsed");
await pro(p);
// 20-revision cap
for (let i = 0; i < 12; i++) await pub(2);
ok((await admin.query("select count(*) c from qrforge.page_revisions where page_id=$1", [live])).rows[0].c <= 20, "PUBLISH: revision history capped at 20");

// media quota
const m = (u, pageId, bytes = 1000, vb = 500) => raw("insert into qrforge.page_media(page_id,user_id,kind,path,vcf_path,mime,bytes,vcf_bytes,width,height) values($1,$2,'portrait',$3,$4,'image/webp',$5,$6,512,512)", [pageId, u, "p/" + Math.random(), "v/" + Math.random(), bytes, vb]);
ok((await m(p, live)).ok, "MEDIA: insert within quota");
ok((await m(p, live, 26_000_000)).code === "QF011" || !(await m(p, live, 26_000_000)).ok, "MEDIA: byte quota refuses overflow (QF011)");
const mm = await Promise.all(Array.from({ length: 12 }, () => m(p, live, 100, 100)));
ok((await admin.query("select count(*) c from qrforge.page_media where page_id=$1", [live])).rows[0].c <= 8, "MEDIA: at most 8 images per page under concurrency");
ok(!(await raw("insert into qrforge.page_media(page_id,user_id,kind,path,mime,bytes,width,height) values($1,$2,'portrait','x','image/svg+xml',10,1,1)", [live, p])).ok, "MEDIA: SVG mime rejected by constraint");

// tenant isolation through the data API role
const tables = ["pages", "page_revisions", "page_media"];
for (const t of tables) {
  ok(!(await asUser(p, `select * from qrforge.${t}`)).ok, `RLS: signed-in user cannot read ${t} through the data API`);
  ok(!(await asUser(p, `delete from qrforge.${t}`)).ok, `RLS: signed-in user cannot delete from ${t}`);
}
ok(!(await asUser(p, "insert into qrforge.pages(user_id,kind,title,public_id,draft) values($1,'card','x','abcdefghjk','{}')", [p])).ok, "RLS: signed-in user cannot insert pages directly (no quota bypass)");
ok(!(await asUser(p, "update qrforge.pages set lifecycle='published'")).ok, "RLS: signed-in user cannot update pages directly");
ok(!(await asUser(p, "select qrforge.publish_page($1,$2,1,'{}')", [live, p])).ok, "RLS: users cannot call publish_page directly");
ok(!(await asUser(p, "select qrforge.active_plan($1)", [p])).ok, "RLS: users cannot call active_plan");

// rollback leaves earlier schema intact
await admin.query(fs.readFileSync(`${REPO}/supabase/rollback/20261016000000_hosted_pages.down.sql`, "utf8"));
const left = (await admin.query("select to_regclass('qrforge.pages') a, to_regclass('qrforge.page_media') b, (select count(*) from pg_proc where proname in ('publish_page','active_plan')) f, (select count(*) from information_schema.columns where table_name='plan_limits' and column_name='max_pages') c")).rows[0];
ok(left.a === null && left.b === null && left.f == 0 && left.c == 0, "ROLLBACK: pages objects and new columns removed");
ok((await admin.query("select count(*) c from qrforge.plan_limits")).rows[0].c == 3 && (await admin.query("select count(*) c from pg_trigger where tgname='qr_codes_entitlements'")).rows[0].c == 1, "ROLLBACK: earlier entitlements intact");
await admin.query(mig);
ok((await admin.query("select max_pages from qrforge.plan_limits where plan='pro'")).rows[0].max_pages == 5, "RE-APPLY: migration re-runs after rollback");

console.log(`\n${pass} passed, ${fail} failed`);
await admin.end(); await server.stop(); process.exit(fail ? 1 : 0);
