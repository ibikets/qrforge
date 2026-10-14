// Control: standard square-module QRs rendered by a different generator path (qrcode's own PNG) at the same sizes.
import fs from "node:fs";
import { createRequire } from "node:module";
const rq = createRequire((process.env.QRF_ROOT ?? process.cwd()) + "/package.json");
const sharp = rq("sharp"); const jsQR = rq("jsqr"); const QRCode = rq("qrcode");
const exp = JSON.parse(fs.readFileSync("out/expected.json"));
const uniq = [...new Map(Object.entries(exp).filter(([k]) => k.endsWith("_dots_2048_plain.png")).map(([k, v]) => [k.split("_")[0], v])).entries()];
let ok = 0, n = 0;
for (const [, payload] of uniq) for (const px of [256, 512, 1024, 2048, 4096]) {
  const png = await QRCode.toBuffer(payload, { errorCorrectionLevel: "H", margin: 4, width: px });
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  n++; if (jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data === payload) ok++;
}
console.log(`control (qrcode lib's own standard PNG): jsQR ${ok}/${n}`);
