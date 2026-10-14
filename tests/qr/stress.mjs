import fs from "node:fs";
import { createRequire } from "node:module";
const rq = createRequire((process.env.QRF_ROOT ?? process.cwd()) + "/package.json");
const sharp = rq("sharp");
import { readBarcodes, prepareZXingModule } from "zxing-wasm/reader";
await prepareZXingModule({ overrides: { wasmBinary: fs.readFileSync(process.env.ZXW).buffer }, fireImmediately: true });
const man = JSON.parse(fs.readFileSync("out/manifest.json")); const exp = JSON.parse(fs.readFileSync("out/expected.json"));
const dec = async (buf, payload) => { const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); const r = await readBarcodes({ data: new Uint8ClampedArray(data), width: info.width, height: info.height, colorSpace: "srgb" }, { formats: ["QRCode"], tryHarder: true }); return r[0]?.text === payload; };
const T = {
  "rotate 17deg": (p) => sharp(p).rotate(17, { background: "#ffffff" }).png().toBuffer(),
  "blur 2.5px @512": (p) => sharp(p).blur(2.5).png().toBuffer(),
  "JPEG q30 @220px": async (p) => sharp(await sharp(p).resize(220).jpeg({ quality: 30 }).toBuffer()).png().toBuffer(),
  "downscale 120px (tiny)": (p) => sharp(p).resize(120, 120, { kernel: "nearest" }).png().toBuffer(),
  "uneven light (gradient) + noise": async (p) => { const m = await sharp(p).metadata(); const w = m.width; const g = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${w}"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`); return sharp(p).composite([{ input: g }]).png().toBuffer(); },
};
const sel = man.filter((e) => e.size === 512);
const tally = {};
for (const e of sel) {
  const p = `out/${e.name}`;
  for (const [tn, fn] of Object.entries(T)) { const ok = await dec(await fn(p), exp[e.name]); const k = `${tn}|${e.dots}`; (tally[k] ??= [0, 0]); tally[k][0] += ok; tally[k][1]++; }
}
const styles = ["square", "rounded", "dots"];
console.log("ZXing success on distorted 512px exports (8 types x logo on/off = 16 per cell)");
console.log("transform".padEnd(34), styles.map((s) => s.padEnd(9)).join(""));
for (const tn of Object.keys(T)) console.log(tn.padEnd(34), styles.map((s) => `${tally[tn + "|" + s][0]}/${tally[tn + "|" + s][1]}`.padEnd(9)).join(""));
