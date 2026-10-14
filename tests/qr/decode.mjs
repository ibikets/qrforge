import fs from "node:fs";
import { createRequire } from "node:module";
const rq = createRequire((process.env.QRF_ROOT ?? process.cwd()) + "/package.json");
const sharp = rq("sharp"); const jsQR = rq("jsqr");
import { readBarcodes, prepareZXingModule } from "zxing-wasm/reader";
await prepareZXingModule({ overrides: { wasmBinary: fs.readFileSync(process.env.ZXW).buffer }, fireImmediately: true });
const dir = process.argv[2]; const scale = Number(process.argv[3] ?? 0); // 0 = original, else downscale to N px
const man = JSON.parse(fs.readFileSync(dir + "/manifest.json")); const exp = JSON.parse(fs.readFileSync(dir + "/expected.json"));
const res = {}; 
for (const e of man) {
  let img = sharp(`${dir}/${e.name}`); if (scale) img = img.resize(scale, scale, { kernel: "lanczos3" });
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const j = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  let z = null; try { const r = await readBarcodes({ data: new Uint8ClampedArray(data), width: info.width, height: info.height, colorSpace: "srgb" }, { formats: ["QRCode"], tryHarder: true }); z = r[0]?.text ?? null; } catch (err) { z = "ERR " + err.message; }
  res[e.name] = { jsqr: j?.data === exp[e.name], zxing: z === exp[e.name] };
}
fs.writeFileSync(`${dir}/res_js_${scale}.json`, JSON.stringify(res));
const t = Object.values(res); console.log(`scale=${scale || "orig"}: jsQR ${t.filter((r) => r.jsqr).length}/${t.length}, ZXing ${t.filter((r) => r.zxing).length}/${t.length}`);
