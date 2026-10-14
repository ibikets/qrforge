// Generates every combination through the real /api/generate route (Business session on the stand-in), saves the files.
import fs from "node:fs";
import { ctl, BASE, sub, sessionCookie } from "../e2e/lib.mjs";
import { createRequire } from "node:module";
const sharp = createRequire((process.env.QRF_ROOT ?? process.cwd()) + "/package.json")("sharp");
const ck = sessionCookie(); const cookie = `${ck.name}=${ck.value}`;
await ctl({ reset: true }); await ctl({ push: { subscriptions: [sub("business", 20)] } });
const cases = [
  ["url", { url: "example.com/menu?a=1&b=é" }],
  ["text", { text: "Line1\nLine2 ✓ ₦3,500 " + "x".repeat(300) }],
  ["email", { to: "hello@example.com", subject: "Order & more", body: "Hi there\nSecond line" }],
  ["phone", { phone: "+234 800 000 0000" }],
  ["sms", { phone: "+2348000000000", message: "Hello there" }],
  ["whatsapp", { phone: "+234 800 000 0000", message: "Hi & bye ✓" }],
  ["wifi", { ssid: "My;Net", password: "p:a;ss\"word1", encryption: "WPA", hidden: "true" }],
  ["vcard", { firstName: "Tola", lastName: "Ade", org: "Kitchen", title: "Chef", phone: "+2348000000000", email: "t@example.com", website: "example.com" }],
];
const logo = "data:image/png;base64," + (await sharp({ create: { width: 128, height: 128, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 1 } } }).png().toBuffer()).toString("base64");
const out = process.argv[2] ?? "out"; fs.mkdirSync(out, { recursive: true });
let n = 0, ip = 1; const manifest = [];
for (const [type, fields] of cases) for (const dots of ["square", "rounded", "dots"]) for (const size of [256, 512, 2048, 4096]) for (const withLogo of [false, true]) {
  const r = await fetch(BASE + "/api/generate", { method: "POST", headers: { "content-type": "application/json", cookie, "x-real-ip": `10.0.${(ip >> 8) & 255}.${ip++ & 255}` }, body: JSON.stringify({ type, format: "png", size, fields, style: { fg: "#111111", bg: "#ffffff", dots, logo: withLogo ? logo : null } }) });
  if (r.status !== 200) { console.log("HTTP", r.status, type, dots, size, withLogo); continue; }
  const name = `${type}_${dots}_${size}_${withLogo ? "logo" : "plain"}.png`;
  fs.writeFileSync(`${out}/${name}`, Buffer.from(await r.arrayBuffer()));
  manifest.push({ name, type, dots, size, logo: withLogo, fields });
  n++;
}
fs.writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest));
console.log("exported", n);
