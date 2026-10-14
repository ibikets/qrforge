// Image upload/archive against the BUILT app + stand-ins (stand-in tests; storage is an in-memory fake, not Supabase Storage).
import { createRequire } from "node:module";
import { BASE, ctl, staffSession } from "./lib.mjs";
import { seed, IDS } from "./seed-admin.mjs";
const sharp = createRequire(process.env.QRF_REPO ? process.env.QRF_REPO + "/package.json" : process.cwd() + "/package.json")("sharp"); // run from the repo root, or set QRF_REPO
let bad = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
await seed();
const cookieOf = (id, email) => staffSession(id, email);
const png = (w = 64, h = 48) => sharp({ create: { width: w, height: h, channels: 3, background: "#176B4F" } }).png().toBuffer();
const up = async (cookie, buf, { name = "a.png", type = "image/png", alt = "A green square for tests" } = {}) => {
  const fd = new FormData(); fd.set("file", new File([buf], name, { type })); if (alt !== null) fd.set("alt", alt);
  const r = await fetch(BASE + "/api/admin/assets", { method: "POST", headers: cookie ? { cookie } : {}, body: fd }); let j = {}; try { j = await r.json(); } catch {} return { s: r.status, j };
};
const editor = await cookieOf(IDS.editor, "editor@example.com");
const owner = await cookieOf(IDS.owner, "owner@example.com");
const support = await cookieOf(IDS.support, "support@example.com");
const billing = await cookieOf(IDS.billing, "billing@example.com");

ok((await up(null, await png())).s === 401, "anonymous upload -> 401");
ok((await up(support, await png())).s === 403, "Support cannot upload (403)");
ok((await up(billing, await png())).s === 403, "Billing cannot upload (403)");
const good = await up(editor, await png());
ok(good.s === 201 && /\.png$/.test(good.j.path), "Content Editor uploads a valid PNG (201, generated name)");
const st = await ctl();
const put = st.log.filter((l) => l.op === "storage_put").at(-1);
ok(put && put.bucket === "site-assets" && put.path === good.j.path && !put.path.includes("a.png"), "stored under a server-generated name in the site-assets bucket");
ok(st.tables.content_assets.some((r) => r.path === good.j.path && r.alt === "A green square for tests" && r.uploaded_by === IDS.editor), "record written with description and uploader");
ok(st.tables.audit_events.some((r) => r.action === "asset.uploaded" && r.actor_id === IDS.editor), "upload audited");

const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>');
ok((await up(editor, svg, { name: "x.svg", type: "image/svg+xml" })).s === 422, "SVG refused");
ok((await up(editor, svg, { name: "x.png", type: "image/png" })).s === 422, "SVG disguised as .png/image/png refused (content decides)");
ok((await up(editor, Buffer.from("<html><script>1</script></html>"), { name: "x.png", type: "image/png" })).s === 422, "HTML disguised as PNG refused");
ok((await up(editor, await sharp({ create: { width: 20, height: 20, channels: 3, background: "#fff" } }).gif().toBuffer(), { name: "x.gif", type: "image/gif" })).s === 422, "GIF refused");
ok((await up(editor, Buffer.alloc(3 * 1024 * 1024, 1))).s === 413, "3 MB file refused (413)");
ok((await up(editor, await png(8, 8))).s === 422, "tiny image refused");
ok((await up(editor, await png(), { alt: "" })).s === 422, "missing description refused");
ok((await up(editor, await png(), { alt: "<img src=x onerror=1>" })).s === 422, "markup in description refused");
// metadata and appended data are removed
const jpeg = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#123" } }).withExif({ IFD0: { Copyright: "SECRET-GPS-MARKER" } }).jpeg().toBuffer();
const withTail = Buffer.concat([jpeg, Buffer.from("<script>alert('tail')</script>")]);
const j2 = await up(editor, withTail, { name: "p.jpg", type: "image/jpeg" });
ok(j2.s === 201 && /\.jpg$/.test(j2.j.path), "JPEG with embedded metadata and appended script accepted after re-encoding");
const stored = Buffer.from(await (await fetch(`http://localhost:54321/storage/v1/object/public/site-assets/${j2.j.path}`)).arrayBuffer());
ok(!stored.includes("SECRET-GPS-MARKER") && !stored.includes("<script>") && !(await sharp(stored).metadata()).exif, "stored bytes contain no metadata and no appended script");
// storage failure leaves nothing behind
await ctl({ fail: { storage: true } });
const before = (await ctl()).tables.content_assets.length;
ok((await up(editor, await png())).s === 502 && (await ctl()).tables.content_assets.length === before, "storage failure -> 502, no record created");
await ctl({ fail: {} });

// draft: the server fills the image fields from its own record
const post = async (cookie, body) => { const r = await fetch(BASE + "/api/admin/content", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) }); return { s: r.status, j: await r.json().catch(() => ({})) }; };
const base = { hero: { headline: "Create a code. Make a connection.", support: "Turn a link into a QR code.", cta: "Create", freeNote: "Free PNG." }, uses: [{ title: "Menus", body: "Link to a menu." }], plans: { pro: "More types.", business: "More room." }, faq: [], footer: { links: [] } };
await ctl({ rpc: { save_content_draft: 1 } });
let r = await post(editor, { action: "save_draft", version: 0, data: { ...base, hero: { ...base.hero, image: { assetId: good.j.id, path: "../../evil.png", alt: "forged text", width: 1, height: 1 } } } });
const call = (await ctl()).log.filter((l) => l.op === "rpc" && l.fn === "save_content_draft").at(-1)?.args.p_data.hero.image;
ok(r.s === 200 && call.path === good.j.path && call.alt === "A green square for tests" && call.width === 64, "forged path/alt/size from the browser are replaced by the stored record");
r = await post(editor, { action: "save_draft", version: 0, data: { ...base, hero: { ...base.hero, image: { assetId: "99999999-9999-4999-8999-999999999999" } } } });
ok(r.s === 422, "unknown image id refused");
// archive
await ctl({ tables: { content_drafts: [{ page: "landing", version: 1, data: { ...base, hero: { ...base.hero, image: { assetId: good.j.id } } } }] } });
r = await post(editor, { action: "archive_asset", asset: good.j.id, reason: "tidy up" });
ok(r.s === 409, "archiving an image the draft uses is refused (409)");
await ctl({ tables: { content_drafts: [] } });
r = await post(editor, { action: "archive_asset", asset: good.j.id, reason: "tidy up" });
ok(r.s === 200 && (await ctl()).tables.content_assets.find((a) => a.id === good.j.id).state === "archived", "unused image archives (kept, not deleted)");
ok((await post(support, { action: "archive_asset", asset: good.j.id, reason: "tidy up" })).s === 403, "Support cannot archive");
console.log(bad ? `${bad} FAILED` : "ALL PASS"); process.exit(bad ? 1 : 0);
