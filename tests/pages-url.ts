// Website / link policy for hosted cards. Run: npx tsx tests/pages-url.ts
import { MAX_ROWS, emptyCard, normaliseCard, snapshotOf, validateCard, websiteUrl, buildVcf, readSnapshot, type Card } from "../lib/pages/card";

let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const cardWith = (g: "websites" | "socials" | "emails" | "phones", rows: { value: string; label?: string; public?: boolean }[]): Card => {
  const c = emptyCard(); c.name = "Ada Obi";
  c[g] = rows.map((r, i) => ({ id: `r${i}`, label: r.label ?? "", value: r.value, public: r.public !== false })) as Card["websites"];
  return c;
};

// 1. explicit policy table
const accept: [string, string][] = [
  ["example.com", "https://example.com/"], ["Example.COM", "https://example.com/"], ["  example.com  ", "https://example.com/"],
  ["https://example.com", "https://example.com/"], ["http://example.com", "http://example.com/"],
  ["example.com/path", "https://example.com/path"], ["example.com/a?x=1&y=2#frag", "https://example.com/a?x=1&y=2#frag"],
  ["https://www.example.co.uk/a/b/", "https://www.example.co.uk/a/b/"], ["example.com:8080/x", "https://example.com:8080/x"],
  ["https://example.com?utm_source=qr", "https://example.com/?utm_source=qr"],
];
for (const [i, o] of accept) ok(websiteUrl(i) === o, `accepts ${JSON.stringify(i)} -> ${o}`);
const refuse = [
  "", "   ", "h", "ht", "http", "https", "https:", "https:/", "https://", "https://.", "example", "example.", ".com", "example..com", "-example.com", "example-.com",
  "exa mple.com", "example.com/a b", "example.com /x", "javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<b>x</b>", "mailto:a@b.co", "tel:+2348000000000",
  "ftp://example.com", "file:///etc/passwd", "vbscript:x", "//example.com@evil", "https://user:pw@example.com", "https://example.com@evil.example",
  "localhost", "localhost:3000", "http://127.0.0.1", "https://1.2.3", "https://ex ample.com", "https://example.com\u0000", "https://exa\nmple.com", "x".repeat(301) + ".com",
];
for (const r of refuse) ok(websiteUrl(r) === null, `refuses ${JSON.stringify(r.length > 40 ? r.slice(0, 20) + "…" : r)}`);
// "https://example.com@evil.example" has a user name; "//example.com@evil" has none of a valid host
ok(websiteUrl(null) === null && websiteUrl(undefined) === null && websiteUrl(42) === null, "non-string input returns null instead of throwing");

// 2. character-by-character typing and pasting never throws, and never yields a non-http(s) link
const samples = [
  "https://example.com/path?x=1&y=a b#frag", "javascript:alert(document.cookie)", "http://exa mple.com", "example.com:8080/a?b#c", "https://user:pw@example.com",
  "data:text/html;base64,PHNjcmlwdD4=", "https://日本語.example/パス", "https://example.com/" + "a".repeat(400), "‮https://example.com", "https://example.com/\u0007x",
];
let threw = 0, unsafe = 0, steps = 0;
for (const s of samples) {
  for (let n = 0; n <= s.length; n++) {
    steps++;
    const typed = s.slice(0, n);
    try {
      for (const g of ["websites", "socials"] as const) {
        const c = cardWith(g, [{ value: typed, label: g === "socials" ? "other" : "" }]);
        const snap = snapshotOf(c);
        validateCard(c, false); validateCard(c, true);
        for (const r of [...snap.websites, ...snap.socials]) if (!/^https?:\/\//i.test(r.href)) unsafe++;
        buildVcf(snap);
      }
    } catch { threw++; }
  }
}
ok(threw === 0, `typing ${samples.length} sample addresses one character at a time (${steps} states) never throws`);
ok(unsafe === 0, "no state produces a link that is not http(s)");

// 3. a pasted value is judged the same as a typed one
for (const s of samples) {
  const a = websiteUrl(s); const b = websiteUrl(s.split("").join(""));
  ok(a === b, `paste equals typed for ${JSON.stringify(s.slice(0, 30))}`);
}

// 4. preview/snapshot keeps only finished rows; the draft text itself is untouched
const mix = cardWith("websites", [{ value: "h" }, { value: "example.com" }, { value: "https:" }, { value: "javascript:alert(1)" }, { value: "https://example.org/x?y=1#z" }]);
const snap = snapshotOf(mix);
ok(snap.websites.length === 2 && snap.websites[0].href === "https://example.com/" && snap.websites[1].href === "https://example.org/x?y=1#z", "snapshot keeps only the two valid websites");
ok(mix.websites.map((r) => r.value).join("|") === "h|example.com|https:|javascript:alert(1)|https://example.org/x?y=1#z", "the raw text in the draft is not rewritten");
const errs = validateCard(mix, false);
ok(Object.keys(errs).sort().join() === "websites.0.value,websites.2.value,websites.3.value", "validation flags exactly the three unfinished/unsafe rows");
ok(snapshotOf(cardWith("websites", [{ value: "example.com", public: false }])).websites.length === 0, "a private website is not in the public snapshot");
// duplicates: same site typed two ways
const dup = validateCard(cardWith("websites", [{ value: "example.com" }, { value: "https://EXAMPLE.com/" }]), false);
ok(!!dup["websites.1.value"], "the same site typed two ways is flagged as a repeat");

// 5. many rows add/remove through normaliseCard (server path) keep raw values and order
const many = cardWith("websites", Array.from({ length: MAX_ROWS }, (_, i) => ({ value: `site${i}.example.com` })));
const round = normaliseCard(JSON.parse(JSON.stringify(many)));
ok(round.websites.map((r) => r.value).join() === many.websites.map((r) => r.value).join(), "server-side normalisation keeps website rows and order");
const dirty = normaliseCard({ ...many, websites: [{ id: "a", label: "x", value: "h", public: true }, { id: "b", value: 5 }, null, "str"] });
ok(dirty.websites.length >= 1 && dirty.websites[0].value === "h", "malformed row data is tolerated by normalisation");

// 6. contact file: only valid, public websites; unsafe values never reach it
const vcf = buildVcf(snapshotOf(mix));
ok(vcf.includes("URL:https://example.com/") && vcf.includes("URL:https://example.org/x?y=1#z") && !/URL:.*(javascript|https:\s)/i.test(vcf) && !vcf.includes("URL:h\r"), "contact file lists only the valid websites");
ok(vcf.split("\r\n").every((l) => Buffer.byteLength(l) <= 75), "contact file lines are folded to 75 octets");

// 7. stored snapshots from before this fix, or damaged ones, never break rendering
const damaged = readSnapshot({ v: 1, name: "A", websites: [{ id: "1", text: "x", href: null }, { id: "2", text: "ok", href: "https://ok.example/" }, null], phones: "nope" });
ok(!!damaged && damaged.websites.length === 1 && damaged.phones.length === 0, "a damaged stored snapshot loses only its bad rows");

console.log(bad ? `${bad} FAILED` : "all passed"); process.exit(bad ? 1 : 0);
