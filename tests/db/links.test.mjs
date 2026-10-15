// Dynamic links migration (20261019000000). Real Postgres engine (embedded), NOT Supabase.
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import fs from "node:fs";
const REPO = process.env.QRF_ROOT ?? process.cwd();
const dir = process.env.PGDIR || "/tmp/qrf-pg4";
fs.rmSync(dir, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "pw", port: 54995, persistent: false, postgresFlags: ["-c", "max_connections=200"] });
await server.initialise(); await server.start();
const mk = async () => { const c = new pg.Client({ host: "localhost", port: 54995, user: "postgres", password: "pw", database: "postgres" }); await c.connect(); return c; };
const admin = await mk();
await admin.query(fs.readFileSync(new URL("./bootstrap.sql", import.meta.url), "utf8"));
await admin.query(fs.readFileSync(`${REPO}/supabase/schema.sql`, "utf8"));
for (const f of ["20261014000000_atomic_limits", "20261016000000_hosted_pages", "20261017000000_page_kinds_and_files"]) await admin.query(fs.readFileSync(`${REPO}/supabase/migrations/${f}.sql`, "utf8"));
const mig = fs.readFileSync(`${REPO}/supabase/migrations/20261019000000_dynamic_links.sql`, "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const alpha = "abcdefghjkmnpqrstuvwxyz23456789";
const slug = () => Array.from({ length: 8 }, () => alpha[Math.floor(Math.random() * alpha.length)]).join("");
const U = async (e) => (await admin.query("insert into auth.users(email) values($1) returning id", [e])).rows[0].id;
const q = async (sql, p = []) => { try { return { ok: true, r: await admin.query(sql, p) }; } catch (e) { return { ok: false, code: e.code, msg: e.message }; } };
const pay = (u, plan, kobo) => admin.query("select qrforge.apply_payment($1,$2,$3,$4,null,null,false,30)", ["r" + Math.random(), u, plan, kobo]);
const ins = (u, extra = {}) => q("insert into qrforge.links(user_id,name,slug,destination,rules) values($1,$2,$3,$4,$5) returning id", [u, extra.name ?? "L", extra.slug ?? slug(), extra.dest ?? "https://example.org/a", extra.rules ?? {}]);

const pre = await U("pre@t"); await pay(pre, "pro", 350000);
await admin.query(mig); await admin.query(mig);
ok(true, "migration applies twice without error (idempotent)");
const lim = Object.fromEntries((await q("select plan,max_links from qrforge.plan_limits")).r.rows.map((r) => [r.plan, r.max_links]));
ok(lim.free === 0 && lim.pro === 25 && lim.business === 250, `plan limits: free 0, pro 25, business 250 (${JSON.stringify(lim)})`);

const free = await U("free@t");
const f = await ins(free); ok(!f.ok && f.code === "QF020", "free plan: creating a link is refused by the database (QF020)");
const pro = pre;
const ids = [];
for (let i = 0; i < 25; i++) { const r = await ins(pro); if (r.ok) ids.push(r.r.rows[0].id); }
ok(ids.length === 25, "pro: 25 links allowed");
const over = await ins(pro); ok(!over.ok && over.code === "QF020", "pro: the 26th is refused");
await q("update qrforge.links set deleted_at = now() where id = $1", [ids[0]]);
ok((await ins(pro)).ok, "pro: a deleted link frees a place");
const race = await Promise.all(Array.from({ length: 12 }, async () => { const c = await mk(); try { return await c.query("insert into qrforge.links(user_id,name,slug,destination) values($1,'R',$2,'https://example.org') returning id", [pro, slug()]).then(() => true, () => false); } finally { await c.end(); } }));
ok(race.filter(Boolean).length === 0, "pro: 12 simultaneous inserts at the limit all lose (advisory lock)");

const dup = slug(); const biz = await U("biz@t"); await pay(biz, "business", 950000);
ok((await ins(biz, { slug: dup })).ok && !(await ins(biz, { slug: dup })).ok, "slugs are unique");
for (const [label, extra] of [["bad slug", { slug: "ABC" }], ["slug with look-alike letters", { slug: "abcdefl0" }], ["javascript: destination", { dest: "javascript:alert(1)" }], ["ftp destination", { dest: "ftp://x.org/f" }], ["empty name", { name: "" }], ["81-character name", { name: "x".repeat(81) }], ["2,001-character destination", { dest: "https://e.org/" + "a".repeat(1990) }], ["array rules", { rules: "[]" }], ["oversized rules", { rules: JSON.stringify({ x: "y".repeat(12100) }) }]]) {
  ok(!(await ins(biz, extra)).ok, `constraint refuses: ${label}`);
}
ok((await q("insert into qrforge.links(user_id,name,slug,destination,state) values($1,'S',$2,'https://example.org','weird')", [biz, slug()])).ok === false, "constraint refuses an unknown state");

const link = (await ins(biz)).r.rows[0].id;
for (let i = 0; i < 3; i++) await admin.query("select qrforge.record_link_open($1,'ios','device',false)", [link]);
await admin.query("select qrforge.record_link_open($1,'other','default',true)", [link]);
const d = (await q("select device,target,bot,opens from qrforge.link_daily where link_id=$1 order by device", [link])).r.rows;
ok(d.length === 2 && d.find((x) => x.device === "ios").opens === 3 && d.find((x) => x.bot).opens === 1, "opens are counted per day, device, destination and previews separately");
const conc = await Promise.all(Array.from({ length: 20 }, async () => { const c = await mk(); try { await c.query("select qrforge.record_link_open($1,'android','schedule',false)", [link]); } finally { await c.end(); } }));
ok(+(await q("select opens from qrforge.link_daily where link_id=$1 and device='android'", [link])).r.rows[0].opens === 20, "20 simultaneous opens count exactly 20 (no lost updates)");
ok(!(await q("select qrforge.record_link_open($1,'tv','default',false)", [link])).ok, "an unknown device value is refused");

// browsers cannot touch these tables or call the counter
async function asUser(uid, sql) { const c = await mk(); try { await c.query("begin"); await c.query("set local role authenticated"); await c.query("select set_config('request.jwt.claim.sub',$1,true)", [uid]); const r = await c.query(sql); await c.query("commit"); return { ok: true, r }; } catch (e) { await c.query("rollback").catch(() => {}); return { ok: false, code: e.code }; } finally { await c.end(); } }
ok(!(await asUser(biz, "select * from qrforge.links")).ok, "signed-in users cannot read links directly");
ok(!(await asUser(biz, "select * from qrforge.link_daily")).ok, "signed-in users cannot read counts directly");
ok(!(await asUser(biz, `insert into qrforge.links(user_id,name,slug,destination) values('${biz}','x','${slug()}','https://e.org')`)).ok, "signed-in users cannot insert links directly");
ok(!(await asUser(biz, `select qrforge.record_link_open('${link}','ios','default',false)`)).ok, "signed-in users cannot call the counter");

await q("delete from auth.users where id = $1", [biz]);
ok(+(await q("select count(*) c from qrforge.links where user_id=$1", [biz])).r.rows[0].c === 0 && +(await q("select count(*) c from qrforge.link_daily where link_id=$1", [link])).r.rows[0].c === 0, "deleting an account removes its links and counts");

const down = fs.readFileSync(`${REPO}/supabase/rollback/20261019000000_dynamic_links.down.sql`, "utf8");
await admin.query(down);
ok(!(await q("select 1 from qrforge.links")).ok && (await q("select 1 from qrforge.plan_limits where plan='pro'")).ok && (await q("select 1 from qrforge.pages limit 1")).ok, "rollback removes only the link objects");
await admin.query(mig);
ok((await q("select count(*) from qrforge.links")).ok, "migration re-applies after rollback");
console.log(fail ? `${fail} FAILED` : `all ${pass} passed`);
await admin.end(); await server.stop(); process.exit(fail ? 1 : 0);
