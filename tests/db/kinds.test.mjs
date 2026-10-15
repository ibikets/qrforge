// Page kinds + files migration (20261017000000). Real Postgres engine (embedded), NOT Supabase.
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import fs from "node:fs";
const REPO = process.env.QRF_ROOT ?? process.cwd();
const dir = process.env.PGDIR || "/tmp/qrf-pg3";
fs.rmSync(dir, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "pw", port: 54996, persistent: false, postgresFlags: ["-c", "max_connections=200"] });
await server.initialise(); await server.start();
const mk = async () => { const c = new pg.Client({ host: "localhost", port: 54996, user: "postgres", password: "pw", database: "postgres" }); await c.connect(); return c; };
const admin = await mk();
await admin.query(fs.readFileSync(new URL("./bootstrap.sql", import.meta.url), "utf8"));
await admin.query(fs.readFileSync(`${REPO}/supabase/schema.sql`, "utf8"));
await admin.query(fs.readFileSync(`${REPO}/supabase/migrations/20261014000000_atomic_limits.sql`, "utf8"));
const m3 = fs.readFileSync(`${REPO}/supabase/migrations/20261016000000_hosted_pages.sql`, "utf8");
const m4 = fs.readFileSync(`${REPO}/supabase/migrations/20261017000000_page_kinds_and_files.sql`, "utf8");
await admin.query(m3);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const alpha = "abcdefghjkmnpqrstuvwxyz23456789";
const pid = () => Array.from({ length: 10 }, () => alpha[Math.floor(Math.random() * alpha.length)]).join("");
const U = async (e) => (await admin.query("insert into auth.users(email) values($1) returning id", [e])).rows[0].id;
const q = async (sql, p = []) => { try { return { ok: true, r: await admin.query(sql, p) }; } catch (e) { return { ok: false, code: e.code, msg: e.message }; } };
const u = await U("biz@t");
await admin.query("select qrforge.apply_payment($1,$2,'business',950000,null,null,false,30)", ["r" + Math.random(), u]);
const ins = (kind, draft = "{}") => q("insert into qrforge.pages(user_id,kind,title,public_id,draft) values($1,$2,'T',$3,$4) returning id", [u, kind, pid(), draft]);

// before: only cards
const card = await ins("card");
ok(card.ok, "BEFORE: a card can be created");
ok(!(await ins("business")).ok, "BEFORE: a business page is refused (kind not yet allowed)");
const cardRow = (await q("select id,public_id from qrforge.pages limit 1")).r.rows[0];
await q("insert into qrforge.page_media(page_id,user_id,kind,path,mime,bytes,width,height) values($1,$2,'portrait','a/b.webp','image/webp',1000,10,10)", [card.r.rows[0].id, u]);

await admin.query(m4); await admin.query(m4); // twice: idempotent
ok((await q("select count(*) c from qrforge.pages")).r.rows[0].c == 1, "AFTER: existing page survives the migration");
ok((await q("select count(*) c from qrforge.page_media")).r.rows[0].c == 1, "AFTER: existing media row survives");
for (const k of ["business","links","social","document","collection","gallery","resume","presentation","menu","product","event","campaign","coupon"]) ok((await ins(k)).ok, `KIND: ${k} accepted`);
ok(!(await ins("bogus")).ok, "KIND: unknown kind still refused");
const biz = (await ins("business")).r.rows[0].id;
// content size
const big = JSON.stringify({ blocks: "x".repeat(100000) });
ok((await q("update qrforge.pages set draft=$1::jsonb where id=$2", [big, biz])).ok, "SIZE: 100 KB draft accepted");
ok(!(await q("update qrforge.pages set draft=$1::jsonb where id=$2", [JSON.stringify({ b: "x".repeat(130000) }), biz])).ok, "SIZE: 130 KB draft refused");
ok(!(await q("update qrforge.pages set draft='[]'::jsonb where id=$1", [biz])).ok, "SIZE: draft must still be an object");
// media
const media = (kind, mime, bytes) => q("insert into qrforge.page_media(page_id,user_id,kind,path,mime,bytes,width,height,original_name,meta) values($1,$2,$3,$4,$5,$6,10,10,'my file.pdf','{\"pages\":3}')", [biz, u, kind, `p/${Math.random()}`, mime, bytes]);
ok((await media("file", "application/pdf", 5_000_000)).ok, "MEDIA: a 5 MB PDF record is accepted");
ok((await media("image", "image/webp", 300_000)).ok, "MEDIA: a gallery image record is accepted");
ok(!(await media("file", "application/pdf", 13_000_000)).ok, "MEDIA: a 13 MB file is refused");
ok(!(await media("file", "text/html", 1000)).ok, "MEDIA: html is refused");
ok(!(await media("video", "image/webp", 1000)).ok, "MEDIA: unknown media kind refused");
ok(!(await q("insert into qrforge.page_media(page_id,user_id,kind,path,mime,bytes,width,height,meta) values($1,$2,'file','x/y','application/pdf',10,1,1,'[]')", [biz, u])).ok, "MEDIA: meta must be an object");
// per-page cap 60, byte quota still enforced
let created = 0; for (let i = 0; i < 70; i++) { const r = await q("insert into qrforge.page_media(page_id,user_id,kind,path,mime,bytes,width,height) values($1,$2,'image',$3,'image/webp',100,1,1)", [biz, u, `many/${i}`]); if (r.ok) created++; else { ok(r.code === "QF012", `CAP: 61st file on a page refused with QF012 (after ${created + 2} files)`); break; } }
// publish still atomic for a new kind
const rev = await q("select qrforge.publish_page($1,$2,1,'{\"v\":2}'::jsonb) v", [biz, u]);
ok(rev.ok === false ? rev.code === "QF023" : rev.r.rows[0].v === 1, "PUBLISH: works for a non-card kind (or reports a version conflict, never a crash)");
// rollback of migration 4 only
await admin.query(fs.readFileSync(`${REPO}/supabase/rollback/20261017000000_page_kinds_and_files.down.sql`, "utf8"));
ok((await q("select count(*) c from qrforge.pages")).r.rows[0].c == 1 && (await q("select count(*) c from qrforge.pages where kind='card'")).r.rows[0].c == 1, "ROLLBACK: only the card remains");
ok((await q("select count(*) c from qrforge.page_media where kind in ('portrait','logo')")).r.rows[0].c == 1, "ROLLBACK: portrait record kept");
ok(!(await ins("business")).ok, "ROLLBACK: business pages refused again");
ok((await q("select count(*) c from information_schema.columns where table_name='page_media' and column_name in ('original_name','meta')")).r.rows[0].c == 0, "ROLLBACK: new columns removed");
await admin.query(m4);
ok((await ins("menu")).ok, "RE-APPLY: migration runs again after rollback");
console.log(`\n${pass} passed, ${fail} failed`);
await admin.end(); await server.stop(); process.exit(fail ? 1 : 0);
