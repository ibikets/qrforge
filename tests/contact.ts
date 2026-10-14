// Repeatable contact fields: helpers, shared validation, vCard encoding, QR round trip.
// Run: npx tsx tests/contact.ts   (optionally VCARD_OUT=<dir> to also write decoded vCards for an independent parser)
import { vEsc } from "../lib/qr-contact";
import QRCode from "qrcode";
import jsQR from "jsqr";
import fs from "node:fs";
import { buildPayload } from "../lib/qr";
import { validateContent } from "../lib/qr-validation";
import { addRow, removeRow, rowsOf, MAX_ROWS } from "../lib/qr-contact";

let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const val = (f: Record<string, string>) => validateContent("vcard", f);
const errs = (f: Record<string, string>) => { const v = val(f); return v.ok ? {} : v.errors; };

// 1. a record saved before this feature (single phone/email/website) still validates and encodes as before
const legacy = { firstName: "Ada", lastName: "Obi", org: "Bitzpark", title: "Founder", phone: "+234 800 000 0000", email: "ada@example.com", website: "https://example.com" };
const lv = val(legacy);
ok(lv.ok, "legacy single-value record validates");
const lp = buildPayload("vcard", legacy);
ok(lp.includes("TEL;TYPE=CELL:+234 800 000 0000") && lp.includes("URL:https://example.com") && /EMAIL;TYPE=INTERNET,WORK:ada@example.com/.test(lp), "legacy record encodes phone, email and website");
ok(lp.startsWith("BEGIN:VCARD\nVERSION:3.0\n") && lp.endsWith("END:VCARD"), "still vCard 3.0");

// 2. several rows of each kind
const multi = {
  ...legacy,
  phone_type: "mobile", phone_2: "+234 801 111 1111", phone_2_type: "work", phone_3: "0802 222 2222", phone_3_type: "home",
  email_2: "ada.work@example.com", email_2_type: "home",
  website_2: "portfolio.example.org",
  social: "adaobi", social_type: "instagram", social_2: "ada-obi", social_2_type: "linkedin", social_3: "https://example.com/ada", social_3_type: "other",
};
const mv = val(multi);
ok(mv.ok, "several rows of every kind validate");
const mp = buildPayload("vcard", multi);
const count = (re: RegExp) => (mp.match(re) ?? []).length;
ok(count(/^TEL;/gm) === 3 && count(/^EMAIL;/gm) === 2 && count(/^URL:/gm) === 2 + 3, "repeated TEL, EMAIL and URL properties (websites + social profiles as URL)");
ok(mp.includes("TEL;TYPE=WORK:+234 801 111 1111") && mp.includes("TEL;TYPE=HOME:0802 222 2222"), "phone labels map to TYPE=CELL/WORK/HOME");
ok(mp.includes("URL:https://instagram.com/adaobi") && mp.includes("URL:https://linkedin.com/in/ada-obi") && mp.includes("URL:https://example.com/ada"), "social handles become https profile addresses");

ok(mp.includes("URL:https://portfolio.example.org"), "a website typed without a scheme is written as an https address");

// 3. empty added rows are ignored
const emptyRows = { firstName: "Ada", phone: "", phone_2: "", email_2: "" };
ok(val(emptyRows).ok && !/^TEL/m.test(buildPayload("vcard", emptyRows)), "empty added rows are skipped, not exported");

// 4. invalid and duplicate entries are reported on the row that has the problem
let e = errs({ ...legacy, email_2: "not-an-email" });
ok(Boolean(e.email_2) && !e.email, "bad email is reported on its own row");
e = errs({ ...legacy, phone_2: "abc" });
ok(Boolean(e.phone_2), "bad phone is reported on its own row");
e = errs({ ...legacy, website_3: "no spaces allowed" });
ok(Boolean(e.website_3), "bad website is reported on its own row");
e = errs({ ...legacy, phone_2: "0801 000 0000" });
ok(!e.phone_2, "different numbers are not duplicates");
e = errs({ ...legacy, phone_2: "+234-800-000-0000" });
ok(e.phone_2 === "Already added above.", "same phone typed differently is a duplicate");
e = errs({ ...legacy, email_2: "ADA@example.com" });
ok(e.email_2 === "Already added above.", "email duplicates ignore case");
e = errs({ ...legacy, website_2: "example.com/" , website: "https://example.com" });
ok(e.website_2 === "Already added above.", "website duplicates ignore scheme and trailing slash");
e = errs({ firstName: "A", social: "adaobi", social_type: "instagram", social_2: "@AdaObi", social_2_type: "instagram" });
ok(e.social_2 === "Already added above.", "the same handle with @ or different case is a duplicate");
e = errs({ firstName: "A", social: "bad handle!", social_type: "x" });
ok(Boolean(e.social), "handle with spaces or punctuation is refused");
e = errs({ firstName: "A", social: "ada", social_type: "other" });
ok(Boolean(e.social), "'Other link' needs a full https address");
e = errs({ firstName: "A", social: "http://insecure.example/a", social_type: "other" });
ok(Boolean(e.social), "'Other link' refuses http");
e = errs({ firstName: "A", social: "javascript:alert(1)", social_type: "other" });
ok(Boolean(e.social), "script addresses are refused");
e = errs({ firstName: "A", phone_type: "fax" });
ok(Boolean(e.phone_type), "unknown label is refused");
e = errs({ firstName: "A", phone_6: "0800 000 0000" });
ok(Boolean(e.phone_6), "a sixth row is not accepted");
e = errs({ firstName: "A", extra: "x" });
ok(Boolean(e.extra), "unknown keys are refused for contact cards");
e = errs({ firstName: "", lastName: "" });
ok(Boolean(e.firstName), "a name is still required");

// 5. escaping
const esc = buildPayload("vcard", { firstName: "Ada", lastName: "Obi, Jr", org: "Acme, Inc.", title: "CEO" });
ok(esc.includes("N:Obi\\, Jr;Ada;;;") && esc.includes("ORG:Acme\\, Inc.") && esc.includes("FN:Ada Obi\\, Jr"), "commas in text values are escaped (RFC 2426)");
ok(val({ firstName: "Ada", org: "A;B" }).ok === false, "semicolons in names/company are still refused");

// 6. row helpers
let f: Record<string, string> = { firstName: "A", phone: "1" };
for (let i = 0; i < 8; i++) f = addRow(f, "phone");
ok(rowsOf(f, "phone").length === MAX_ROWS, "add stops at the limit");
f = { phone: "a", phone_2: "b", phone_2_type: "work", phone_3: "c" };
f = removeRow(f, "phone", 2);
ok(f.phone === "a" && f.phone_2 === "c" && !("phone_3" in f) && !("phone_2_type" in f), "remove shifts later rows up and keeps their labels aligned");
f = removeRow({ phone: "a", phone_type: "work" }, "phone", 1);
ok(f.phone === "" && !("phone_type" in f), "removing the only row clears it");

// 7. long payloads
const long: Record<string, string> = { firstName: "Ada", lastName: "Obi" };
for (let i = 1; i <= 5; i++) long[i === 1 ? "website" : `website_${i}`] = `https://example.com/${"a".repeat(240)}${i}`;
const lv2 = val(long);
ok(!lv2.ok && Boolean((lv2 as { errors: Record<string, string> }).errors.vcard_size), "a card too large for one QR code gives a clear card-level error");
const realistic = { ...multi, phone_4: "0803 333 3333", email_3: "a3@example.com", website_3: "https://third.example.com", social_4: "adaobi", social_4_type: "github" };
ok(val(realistic).ok, "a realistic full card still fits one QR code");

// 8. QR round trip: encode, rasterise, decode with jsQR, compare
function decode(text: string): string | null {
  const q = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = q.modules.size, scale = 8, quiet = 4, w = (n + quiet * 2) * scale;
  const px = new Uint8ClampedArray(w * w * 4).fill(255);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.modules.get(x, y)) for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) { const i = (((y + quiet) * scale + dy) * w + (x + quiet) * scale + dx) * 4; px[i] = px[i + 1] = px[i + 2] = 0; }
  return jsQR(px, w, w)?.data ?? null;
}
for (const [name, rec] of [["legacy", legacy], ["multi", multi], ["realistic", realistic], ["escaped", { firstName: "Ada", lastName: "Obi, Jr", org: "Acme, Inc." }]] as const) {
  const p = buildPayload("vcard", rec as Record<string, string>);
  const d = decode(p);
  ok(d === p, `QR decodes to the identical vCard (${name}, ${p.length} chars)`);
  if (process.env.VCARD_OUT) { fs.mkdirSync(process.env.VCARD_OUT, { recursive: true }); fs.writeFileSync(`${process.env.VCARD_OUT}/${name}.vcf`, d ?? ""); }
}

// 9. a plain URL code keeps exactly one destination
ok(buildPayload("url", { url: "example.com, other.example.org" }) === "https://example.com, other.example.org" && !validateContent("url", { url: "example.com, other.example.org" }).ok, "URL codes are not concatenated: a second address in the field is refused");

// 10. photo for the downloadable contact file; the QR payload never carries it
import { vcfWithPhoto, fold, isPhotoB64, MAX_PHOTO_B64 } from "../lib/vcf";
{
  const jpeg = "/9j/" + "A".repeat(6000);
  const base = { firstName: "Ada", lastName: "Obi", org: "Acme", phone: "+2348000000000" } as Record<string, string>;
  ok(buildPayload("vcard", { ...base, photo: jpeg }) === buildPayload("vcard", base), "photo field never changes the QR payload");
  ok(val({ ...base, photo: jpeg }).ok, "a contact with a photo still validates");
  ok(!val({ ...base, photo: "AAAA" }).ok && !val({ ...base, photo: "/9j/" + "A".repeat(MAX_PHOTO_B64) }).ok && !val({ ...base, photo: "/9j/<script>" }).ok, "non-JPEG, oversize and malformed photo values are rejected");
  const file = vcfWithPhoto(buildPayload("vcard", base), jpeg);
  ok(file.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\n") && file.endsWith("END:VCARD\r\n"), "contact file uses CRLF line endings");
  ok(file.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75), "every line of the file is folded to 75 octets");
  ok(file.replace(/\r\n /g, "").includes("PHOTO;ENCODING=b;TYPE=JPEG:" + jpeg), "unfolding restores the exact photo bytes");
  ok(!vcfWithPhoto(buildPayload("vcard", base), null).includes("PHOTO"), "no photo, no PHOTO property");
  ok(isPhotoB64(jpeg) && !isPhotoB64(""), "photo validator");
  ok(fold("X".repeat(200)).split("\r\n").every((l, i) => (i === 0 ? l.length === 75 : l.length <= 75 && l.startsWith(" "))), "fold splits long lines with a leading space");
  ok(vEsc("a;b,c\\d\ne") === "a\\;b\\,c\\\\d\\ne", "vCard text escaping covers semicolon, comma, backslash and newline");
}
process.exit(bad ? 1 : 0);
