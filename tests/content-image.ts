// Pure checks of the landing content validator's image rules. Run: npx tsx tests/content-image.ts
import { DEFAULT_LANDING, validateLanding } from "../lib/content";
let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const id = "11111111-1111-4111-8111-111111111111";
const img = { assetId: id, path: `${id}.png`, alt: "A QR code on a cafe table", width: 800, height: 400 };
const mk = (image: unknown) => validateLanding({ ...DEFAULT_LANDING, hero: { ...DEFAULT_LANDING.hero, image } });
ok(mk(img).ok, "valid image accepted");
ok(mk(null).ok && mk(undefined).ok, "no image accepted");
ok(!mk({ ...img, path: "../../etc/passwd" }).ok, "path traversal rejected");
ok(!mk({ ...img, path: `${id}.svg` }).ok, "SVG path rejected");
ok(!mk({ ...img, path: "https://evil.example/x.png" }).ok, "absolute URL rejected");
ok(!mk({ ...img, alt: "<script>" }).ok, "markup in alt rejected");
ok(!mk({ ...img, alt: "no" }).ok, "too-short alt rejected");
ok(!mk({ ...img, assetId: "nope" }).ok, "bad asset id rejected");
ok(!mk({ ...img, width: 99999 }).ok, "absurd dimensions rejected");
const r = mk({ ...img, extra: "<b>x</b>" });
ok(r.ok && !("extra" in (r.data.hero.image ?? {})), "unknown image fields dropped");
console.log(bad ? `${bad} FAILED` : "ALL PASS"); process.exit(bad ? 1 : 0);
