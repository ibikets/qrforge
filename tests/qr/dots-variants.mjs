import fs from "node:fs";
import { createRequire } from "node:module";
const rq = createRequire((process.env.QRF_ROOT ?? process.cwd()) + "/package.json");
const sharp = rq("sharp"); const jsQR = rq("jsqr"); const QRCode = rq("qrcode");
import { readBarcodes, prepareZXingModule } from "zxing-wasm/reader";
await prepareZXingModule({ overrides: { wasmBinary: fs.readFileSync(process.env.ZXW).buffer }, fireImmediately: true });
const exp = JSON.parse(fs.readFileSync("out/expected.json"));
const payloads = Object.entries(exp).filter(([k]) => k.endsWith("_dots_2048_plain.png") || k.endsWith("_dots_4096_plain.png")).map(([k, v]) => [k.split("_")[0], v]);
const uniq = [...new Map(payloads.map(([t, p]) => [t, p])).entries()];
// parametric renderer mirroring lib/qr-render.ts
function render(text, { dot = "circle", r = 0.5, finder = "round", quiet = 4, fg = "#111111", bg = "#ffffff" }, px) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "H" }); const n = qr.modules.size; const total = n + quiet * 2;
  const inFinder = (a, c) => (a < 7 && (c < 7 || c >= n - 7)) || (a >= n - 7 && c < 7);
  const p = [`<rect width="${total}" height="${total}" fill="${bg}"/>`];
  for (let a = 0; a < n; a++) for (let c = 0; c < n; c++) { if (!qr.modules.get(a, c) || inFinder(a, c)) continue; const x = c + quiet, y = a + quiet;
    p.push(dot === "circle" ? `<circle cx="${x + 0.5}" cy="${y + 0.5}" r="${r}" fill="${fg}"/>` : `<rect x="${x}" y="${y}" width="1" height="1" fill="${fg}"/>`); }
  const frx = finder === "round" ? 1.5 : 0;
  for (const [a, c] of [[0, 0], [0, n - 7], [n - 7, 0]]) { const x = c + quiet, y = a + quiet;
    p.push(`<rect x="${x}" y="${y}" width="7" height="7" rx="${frx}" fill="${fg}"/><rect x="${x + 1}" y="${y + 1}" width="5" height="5" rx="${frx * 0.6}" fill="${bg}"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="${frx * 0.4}" fill="${fg}"/>`); }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${total} ${total}">${p.join("")}</svg>`;
}
const variants = { "current dots (r=.5, round finders)": {}, "dots, SQUARE finders": { finder: "square" }, "overlapping dots r=.56, round finders": { r: 0.56 }, "overlapping dots r=.56, square finders": { r: 0.56, finder: "square" }, "square modules, round finders": { dot: "rect" }, "square modules, square finders (control)": { dot: "rect", finder: "square" }, "smaller dots r=.42, round finders": { r: 0.42 } };
for (const [label, v] of Object.entries(variants)) {
  let js = 0, zx = 0, n = 0;
  for (const [, payload] of uniq) for (const px of [256, 512, 1024, 2048, 4096]) {
    const { data, info } = await sharp(Buffer.from(render(payload, v, px))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    n++; if (jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data === payload) js++;
    const z = await readBarcodes({ data: new Uint8ClampedArray(data), width: info.width, height: info.height, colorSpace: "srgb" }, { formats: ["QRCode"], tryHarder: true }); if (z[0]?.text === payload) zx++;
  }
  console.log(label.padEnd(44), `jsQR ${js}/${n}  ZXing ${zx}/${n}`);
}
