// Dynamic links: address validation, rule normalisation, routing precedence (device, day/time in time zones), bot split and honest totals. Local logic only.
import { checkDestination, deviceOf, emptyRule, isBot, newSlug, normaliseRules, resolveLink, summarise, SLUG, MAX_RULES, type Daily } from "../lib/links";
let bad = 0; const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const good = (u: string) => { const r = checkDestination(u, "qrenuvi.com"); return r.ok ? r.url : null; };
ok(good("example.org/menu?x=1") === "https://example.org/menu?x=1", "scheme-less address gets https");
ok(good("http://shop.example.org") === "http://shop.example.org/", "http is allowed");
for (const u of ["javascript:alert(1)", "data:text/html,hi", "ftp://a.example.org", "file:///etc/passwd", "https://user:pw@example.org", "https://localhost/x", "https://127.0.0.1/", "https://192.168.0.1/", "https://[::1]/", "https://intranet/", "https://a.internal/", "https://a b.org", "", "   ", "https://qrenuvi.com/l/abcdefgh", "https://QRENUVI.com/l"]) ok(good(u) === null, `refused: ${JSON.stringify(u)}`);
ok(good("https://qrenuvi.com/pricing") !== null, "other pages on this site are fine");
ok(good("https://example.org/" + "a".repeat(2000)) === null, "over 2,000 characters refused");
ok(SLUG.test(newSlug()) && newSlug() !== newSlug(), "slugs are 8 look-alike-free characters and differ");

const UA = { ios: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148", ipad: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120 Mobile", desk: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120" };
ok(deviceOf(UA.ios) === "ios" && deviceOf(UA.ipad) === "ios" && deviceOf(UA.android) === "android" && deviceOf(UA.desk) === "other" && deviceOf(null) === "other", "device from the browser name");
ok(isBot("Mozilla/5.0 (compatible; Googlebot/2.1)") && isBot("facebookexternalhit/1.1") && isBot("Slackbot-LinkExpanding 1.0") && isBot(null) && !isBot(UA.ios) && !isBot(UA.desk), "previews and robots are split from people");

const { rules, problems } = normaliseRules({ ios: "apps.apple.com/app/x", android: "javascript:x", schedule: [{ id: "abcd1234", device: "ios", days: [5, 1, 1, 9, "x"], from: "09:00", to: "17:00", timezone: "Africa/Lagos", url: "example.org/lunch" }, { id: "zz", days: [], from: "10:00", to: "09:00", timezone: "Nope/Zone", url: "bad" }, "junk", null] });
ok(rules.ios === "https://apps.apple.com/app/x" && !!problems.android, "app-store addresses validated one by one");
const r0 = rules.schedule![0];
ok(JSON.stringify(r0.days) === "[1,5]" && r0.url === "https://example.org/lunch", "days de-duplicated, sorted, junk dropped; address normalised");
const bk = Object.keys(problems).filter((k) => k.startsWith("rule.") && !k.startsWith("rule.abcd1234"));
ok(bk.some((k) => k.endsWith(".days")) && bk.some((k) => k.endsWith(".time")) && bk.some((k) => k.endsWith(".timezone")) && bk.some((k) => k.endsWith(".url")), "an invalid rule reports days, time, zone and address problems separately");
ok(normaliseRules({ schedule: Array.from({ length: MAX_RULES + 3 }, () => ({ ...emptyRule(), url: "example.org" })) }).problems.schedule !== undefined, "more than the rule cap is reported");
ok(Object.keys(normaliseRules("nope").rules).length === 0 && Object.keys(normaliseRules(null).problems).length === 0, "non-object rules become empty");

// routing: Lagos is UTC+1 all year. 2026-10-14 is a Wednesday.
const wed = (hhmmUtc: string) => new Date(`2026-10-14T${hhmmUtc}:00Z`);
const link = { destination: "https://main.example.org/", rules: { ios: "https://apps.apple.com/a", android: "https://play.google.com/b", schedule: [{ id: "lunch000", device: "any", days: [1, 2, 3, 4, 5], from: "12:00", to: "14:00", timezone: "Africa/Lagos", url: "https://lunch.example.org/" }, { id: "ioslate0", device: "ios", days: [0, 6], from: "00:00", to: "23:59", timezone: "UTC", url: "https://weekend-ios.example.org/" }] } };
let x = resolveLink(link, UA.desk, wed("11:30"));
ok(x.url === "https://lunch.example.org/" && x.target === "schedule", "12:30 in Lagos on a weekday matches the lunch rule (11:30 UTC)");
x = resolveLink(link, UA.desk, wed("10:59")); ok(x.target === "default" && x.url === link.destination, "11:59 Lagos is before the window");
x = resolveLink(link, UA.desk, wed("13:00")); ok(x.target === "default", "14:00 Lagos is the exclusive end of the window");
x = resolveLink(link, UA.ios, wed("11:30")); ok(x.target === "schedule", "a schedule rule beats the device address");
x = resolveLink(link, UA.ios, wed("18:00")); ok(x.target === "device" && x.url === "https://apps.apple.com/a" && x.device === "ios", "outside the window an iPhone gets its app-store address");
x = resolveLink(link, UA.android, wed("18:00")); ok(x.url === "https://play.google.com/b", "Android gets its own address");
x = resolveLink(link, UA.desk, wed("18:00")); ok(x.target === "default", "a computer gets the main destination");
x = resolveLink(link, UA.ios, new Date("2026-10-17T10:00:00Z")); ok(x.url === "https://weekend-ios.example.org/", "a device-limited rule matches only that device on its days (Saturday UTC)");
x = resolveLink(link, UA.android, new Date("2026-10-17T10:00:00Z")); ok(x.target === "device", "the same Saturday rule does not apply to Android");
x = resolveLink({ destination: "https://m.example.org/", rules: { schedule: [{ id: "broken00", device: "any", days: [3], from: "00:00", to: "23:59", timezone: "Bad/Zone", url: "https://x.example.org/" }] } }, UA.desk, wed("11:00")); ok(x.target === "default", "a rule with an unusable time zone is skipped, never fatal");
x = resolveLink({ destination: "https://m.example.org/", rules: null }, UA.ios, wed("11:00")); ok(x.target === "default", "missing rules fall back to the destination");
// the same instant, different zones: 23:30 UTC Wed is Thu 00:30 in Lagos
const night = { destination: "https://m.example.org/", rules: { schedule: [{ id: "thu00000", device: "any", days: [4], from: "00:00", to: "01:00", timezone: "Africa/Lagos", url: "https://thu.example.org/" }] } };
ok(resolveLink(night, UA.desk, wed("23:30")).target === "schedule" && resolveLink(night, UA.desk, wed("21:30")).target === "default", "the day is the day in the rule's zone, not UTC");

const today = new Date("2026-10-15T12:00:00Z");
const rows: Daily[] = [
  { day: "2026-10-15", device: "ios", target: "device", bot: false, opens: 5 }, { day: "2026-10-15", device: "other", target: "default", bot: false, opens: 3 },
  { day: "2026-10-14", device: "android", target: "schedule", bot: false, opens: 2 }, { day: "2026-10-14", device: "other", target: "default", bot: true, opens: 9 },
  { day: "2026-10-13", device: "other", target: "paused", bot: false, opens: 1 }, { day: "2026-08-01", device: "other", target: "default", bot: false, opens: 100 },
];
const s = summarise(rows, today);
ok(s.opens === 11 && s.previews === 9 && s.allTime === 111, "opens exclude previews; all-time includes old days; the window is 30 days");
ok(s.byDevice.ios === 5 && s.byDevice.android === 2 && s.byDevice.other === 4, "device split excludes previews");
ok(s.byTarget.default === 3 && s.byTarget.device === 5 && s.byTarget.schedule === 2 && s.byTarget.paused === 1, "destination split adds up to opens");
ok(s.series.length === 30 && s.series[29].opens === 8 && s.series[28].opens === 2 && s.series.reduce((n, d) => n + d.opens, 0) === s.opens, "daily series covers 30 days and matches the total");
process.exit(bad ? 1 : 0);
