import fs from "node:fs";
import { validateContent } from "../../lib/qr-validation";
const m = JSON.parse(fs.readFileSync(process.argv[2] + "/manifest.json", "utf8"));
const exp: Record<string, string> = {};
for (const e of m) { const v = validateContent(e.type, e.fields); if (v.ok) exp[e.name] = v.payload; }
fs.writeFileSync(process.argv[2] + "/expected.json", JSON.stringify(exp));
console.log(Object.keys(exp).length, "expected payloads");
