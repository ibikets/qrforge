import fs from "node:fs"; import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { ctl, BASE, sub, sessionCookie } from "../e2e/lib.mjs";
const rq = createRequire((process.env.QRF_ROOT ?? process.cwd()) + "/package.json"); const sharp = rq("sharp"); const jsQR = rq("jsqr");
import { readBarcodes, prepareZXingModule } from "zxing-wasm/reader";
await prepareZXingModule({ overrides: { wasmBinary: fs.readFileSync(process.env.ZXW).buffer }, fireImmediately: true });
const ck = sessionCookie(); const cookie = `${ck.name}=${ck.value}`;
await ctl({ reset: true }); await ctl({ push: { subscriptions: [sub("business", 20)] } });
const man = JSON.parse(fs.readFileSync("out/manifest.json")); const exp = JSON.parse(fs.readFileSync("out/expected.json"));
const logo = "data:image/png;base64," + (await sharp({ create: { width: 128, height: 128, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 1 } } }).png().toBuffer()).toString("base64");
const read = async (buf) => { const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); const z = await readBarcodes({ data: new Uint8ClampedArray(data), width: info.width, height: info.height, colorSpace: "srgb" }, { formats: ["QRCode"], tryHarder: true }); const j = jsQR(new Uint8ClampedArray(data), info.width, info.height); return { z: z[0]?.text, j: j?.data }; };
let ip = 1; const gen = (e, format, size, style) => fetch(BASE + "/api/generate", { method: "POST", headers: { "content-type": "application/json", cookie, "x-real-ip": `10.9.${(ip >> 8) & 255}.${ip++ & 255}` }, body: JSON.stringify({ type: e.type, format, size, fields: e.fields, style }) });
const base = man.filter((e) => e.size === 512);
const stats = {};
const bump = (k, z, j) => { (stats[k] ??= { n: 0, z: 0, j: 0 }); stats[k].n++; stats[k].z += z; stats[k].j += j; };
for (const e of base) {
  const style = { fg: "#111111", bg: "#ffffff", dots: e.dots, logo: e.logo ? logo : null }; const want = exp[e.name];
  // SVG export rasterised at two sizes
  const svg = Buffer.from(await (await gen(e, "svg", 1024, style)).arrayBuffer());
  for (const px of [300, 1600]) { const r = await read(await sharp(svg, { density: 72 }).resize(px, px).png().toBuffer()); bump(`SVG export @${px}px`, r.z === want, r.j === want); }
  // PDF export rasterised at 150 and 300 dpi
  const pdf = Buffer.from(await (await gen(e, "pdf", 1024, style)).arrayBuffer()); fs.writeFileSync("/tmp/qrf-x.pdf", pdf);
  for (const dpi of [150, 300]) { execFileSync("pdftoppm", ["-r", String(dpi), "-png", "-singlefile", "/tmp/qrf-x.pdf", "/tmp/qrf-x"]); const r = await read(fs.readFileSync("/tmp/qrf-x.png")); bump(`PDF export @${dpi}dpi`, r.z === want, r.j === want); }
}
// Brand palettes (PNG 1024) on the wifi + url payloads, styles x logo
const palettes = { "forest on ivory": ["#1f4d3a", "#f6f1e7"], "dark navy on white": ["#0b1f44", "#ffffff"], "mid-grey on white (low contrast)": ["#8a8a8a", "#ffffff"], "black on yellow": ["#000000", "#ffd400"], "INVERTED white on black": ["#ffffff", "#000000"] };
for (const [pn, [fg, bg]] of Object.entries(palettes)) for (const e of base.filter((x) => ["url", "wifi", "vcard"].includes(x.type))) {
  const buf = Buffer.from(await (await gen(e, "png", 1024, { fg, bg, dots: e.dots, logo: e.logo ? logo : null })).arrayBuffer()); const r = await read(buf); bump(`palette: ${pn}`, r.z === exp[e.name], r.j === exp[e.name]);
}
console.log("case".padEnd(40), "n".padEnd(4), "ZXing".padEnd(8), "jsQR");
for (const [k, v] of Object.entries(stats)) console.log(k.padEnd(40), String(v.n).padEnd(4), String(v.z).padEnd(8), v.j);
