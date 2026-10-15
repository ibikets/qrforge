import { randomBytes } from "node:crypto";

/** Dynamic links: a permanent /l/<slug> address whose destination the owner can change after printing. Pure logic, shared by the editor, the API and the redirect. */
export type Device = "ios" | "android" | "other";
export type RuleDevice = "any" | Device;
export type ScheduleRule = { id: string; device: RuleDevice; days: number[]; from: string; to: string; timezone: string; url: string };
export type Rules = { ios?: string; android?: string; schedule?: ScheduleRule[] };
export type Target = "default" | "device" | "schedule" | "paused";

export const MAX_RULES = 8;
export const SLUG = /^[a-z2-9]{8}$/;
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ALPHA = "abcdefghjkmnpqrstuvwxyz23456789";
export const newSlug = () => Array.from(randomBytes(8), (x) => ALPHA[x % ALPHA.length]).join("");
export const DEVICE_LABEL: Record<RuleDevice, string> = { any: "Any device", ios: "iPhone or iPad", android: "Android", other: "Computer or other" };

/** http(s) only, no embedded credentials, no internal or numeric hosts, and never a loop back into this service's own /l/ addresses. */
export function checkDestination(raw: unknown, selfHost?: string): { ok: true; url: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "Enter a web address." };
  let s = raw.trim();
  if (!s) return { ok: false, error: "Enter a web address." };
  if (/[\s\u0000-\u001f]/.test(s)) return { ok: false, error: "The address cannot contain spaces." };
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`;
  let u: URL;
  try { u = new URL(s); } catch { return { ok: false, error: "That doesn’t look like a web address." }; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, error: "Only web addresses starting with http:// or https:// can be used." };
  if (u.username || u.password) return { ok: false, error: "Addresses with a username or password in them are not allowed." };
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || /^\d+(\.\d+){3}$/.test(h) || h.startsWith("[") || /(^|\.)(localhost|local|internal|test|invalid|example)$/.test(h) || /\.$/.test(h))
    return { ok: false, error: "Use a public website address (not an IP address or an internal name)." };
  if (selfHost && h === selfHost.toLowerCase() && /^\/l(\/|$)/.test(u.pathname)) return { ok: false, error: "A link cannot point at another Qrenuvi link." };
  const out = u.toString();
  if (out.length > 2000) return { ok: false, error: "That address is too long (2,000 characters at most)." };
  return { ok: true, url: out };
}

const HM = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const validTz = (tz: string) => { try { new Intl.DateTimeFormat("en-GB", { timeZone: tz }); return tz.length <= 64 && /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(tz); } catch { return false; } };
const mins = (hm: string) => +hm.slice(0, 2) * 60 + +hm.slice(3);

export type RuleProblems = Record<string, string>;
export const emptyRule = (): ScheduleRule => ({ id: Math.random().toString(36).slice(2, 10), device: "any", days: [1, 2, 3, 4, 5], from: "09:00", to: "17:00", timezone: "Africa/Lagos", url: "" });

/** Clean unknown input into Rules plus problems keyed by field (`ios`, `android`, `rule.<id>.url|days|time|timezone`). */
export function normaliseRules(raw: unknown, selfHost?: string): { rules: Rules; problems: RuleProblems } {
  const problems: RuleProblems = {};
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const rules: Rules = {};
  for (const k of ["ios", "android"] as const) {
    const v = typeof r[k] === "string" ? (r[k] as string).trim() : "";
    if (!v) continue;
    const c = checkDestination(v, selfHost);
    if (c.ok) rules[k] = c.url; else { problems[k] = c.error; rules[k] = v; }
  }
  const list = Array.isArray(r.schedule) ? r.schedule.slice(0, MAX_RULES) : [];
  if (Array.isArray(r.schedule) && r.schedule.length > MAX_RULES) problems.schedule = `Use at most ${MAX_RULES} schedule rules.`;
  const seen = new Set<string>();
  const sched: ScheduleRule[] = [];
  for (const x of list) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    let id = typeof o.id === "string" && /^[a-z0-9]{4,16}$/.test(o.id) && !seen.has(o.id) ? o.id : Math.random().toString(36).slice(2, 10);
    seen.add(id); id = id.slice(0, 16);
    const device = (["any", "ios", "android", "other"] as const).includes(o.device as RuleDevice) ? (o.device as RuleDevice) : "any";
    const days = Array.isArray(o.days) ? [...new Set(o.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [];
    const from = typeof o.from === "string" ? o.from : "", to = typeof o.to === "string" ? o.to : "";
    const timezone = typeof o.timezone === "string" ? o.timezone : "";
    const urlRaw = typeof o.url === "string" ? o.url.trim() : "";
    if (!days.length) problems[`rule.${id}.days`] = "Pick at least one day.";
    if (!HM.test(from) || !HM.test(to)) problems[`rule.${id}.time`] = "Enter the start and end as hours and minutes, like 09:00.";
    else if (mins(from) >= mins(to)) problems[`rule.${id}.time`] = "The end must be after the start. For overnight, add two rules (late evening, then early morning).";
    if (!validTz(timezone)) problems[`rule.${id}.timezone`] = "Choose a time zone from the list, like Africa/Lagos.";
    let url = urlRaw;
    const c = checkDestination(urlRaw, selfHost);
    if (c.ok) url = c.url; else problems[`rule.${id}.url`] = c.error;
    sched.push({ id, device, days, from, to, timezone, url });
  }
  if (sched.length) rules.schedule = sched;
  return { rules, problems };
}

export function deviceOf(ua: string | null | undefined): Device {
  const s = ua ?? "";
  if (/iPhone|iPad|iPod/i.test(s)) return "ios";
  if (/Android/i.test(s)) return "android";
  return "other";
}
/** Link-preview fetchers and crawlers are counted separately so they do not inflate "people". Best effort: an unrecognised robot still counts as a person. */
export const isBot = (ua: string | null | undefined) => !ua || /bot\b|bot\/|crawl|spider|preview|facebookexternalhit|slurp|headless|monitor|uptime|curl\/|wget\/|python-requests|go-http-client|embedly|skypeuripreview|whatsapp\/|telegram|discord|slack|vkshare|pinterest|quora link/i.test(ua);

function wall(now: Date, tz: string): { day: number; m: number } {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { day, m: +get("hour") * 60 + +get("minute") };
}

/** Order of precedence: first matching schedule rule, then the device's own address, then the default destination. */
export function resolveLink(link: { destination: string; rules: unknown }, ua: string | null | undefined, now: Date = new Date()): { url: string; device: Device; target: Target } {
  const device = deviceOf(ua);
  const rules = (link.rules && typeof link.rules === "object" ? link.rules : {}) as Rules;
  for (const r of rules.schedule ?? []) {
    if (r.device !== "any" && r.device !== device) continue;
    try {
      const w = wall(now, r.timezone);
      if (r.days.includes(w.day) && w.m >= mins(r.from) && w.m < mins(r.to)) return { url: r.url, device, target: "schedule" };
    } catch { /* an unusable rule is skipped, never fatal */ }
  }
  if (device === "ios" && rules.ios) return { url: rules.ios, device, target: "device" };
  if (device === "android" && rules.android) return { url: rules.android, device, target: "device" };
  return { url: link.destination, device, target: "default" };
}

export type LinkRow = { id: string; user_id: string; name: string; slug: string; destination: string; rules: Rules; state: "active" | "paused"; version: number; taken_down_at: string | null; deleted_at: string | null; created_at: string; updated_at: string };
export const LINK_COLS = "id,user_id,name,slug,destination,rules,state,version,taken_down_at,deleted_at,created_at,updated_at";

export type Daily = { day: string; device: Device; target: Target; bot: boolean; opens: number };
/** Totals shown to the owner. "Opens" are requests to the link, not unique people or confirmed scans (a QR scan and a typed or tapped link look the same). */
export function summarise(rows: Daily[], today: Date = new Date(), days = 30) {
  const from = new Date(today.getTime() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const inRange = rows.filter((r) => r.day >= from);
  const sum = (f: (r: Daily) => boolean) => inRange.filter(f).reduce((n, r) => n + r.opens, 0);
  const series: { day: string; opens: number }[] = [];
  for (let i = days - 1; i >= 0; i--) { const d = new Date(today.getTime() - i * 86_400_000).toISOString().slice(0, 10); series.push({ day: d, opens: inRange.filter((r) => r.day === d && !r.bot).reduce((n, r) => n + r.opens, 0) }); }
  return {
    opens: sum((r) => !r.bot), previews: sum((r) => r.bot),
    byDevice: { ios: sum((r) => !r.bot && r.device === "ios"), android: sum((r) => !r.bot && r.device === "android"), other: sum((r) => !r.bot && r.device === "other") },
    byTarget: { default: sum((r) => !r.bot && r.target === "default"), device: sum((r) => !r.bot && r.target === "device"), schedule: sum((r) => !r.bot && r.target === "schedule"), paused: sum((r) => !r.bot && r.target === "paused") },
    allTime: rows.filter((r) => !r.bot).reduce((n, r) => n + r.opens, 0), series, days,
  };
}
