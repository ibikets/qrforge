import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import type { IncomingMessage } from "node:http";
import zlib from "node:zlib";

/**
 * Fetching a web page or picture on a customer's behalf. This is the only place the app makes such requests, so every defence lives here:
 * https only, standard port, no credentials in the address, no internal names or addresses, DNS answers checked and the connection pinned to
 * the checked address (so a second, different answer cannot be used), every redirect re-checked, hard limits on time, size and redirects,
 * decompression bounded, content type allow-listed, no cookies and no credentials ever sent.
 */
export class FetchError extends Error { constructor(public code: "blocked" | "unreachable" | "denied" | "type" | "size" | "time" | "robots" | "status", message: string) { super(message); } }

const v4 = (ip: string) => ip.split(".").map(Number);
function blockedV4(ip: string): boolean {
  const [a, b, c] = v4(ip);
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 192 && b === 88 && c === 99) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113);
}
function groups6(ip: string): number[] | null {
  let s = ip.toLowerCase().split("%")[0];
  const m = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (m) { const p = v4(m[1]); s = s.slice(0, -m[1].length) + ((p[0] << 8) | p[1]).toString(16) + ":" + ((p[2] << 8) | p[3]).toString(16); }
  const [head, tail] = s.split("::");
  const h = head ? head.split(":") : [], t = tail === undefined ? [] : tail ? tail.split(":") : [];
  if (tail === undefined ? h.length !== 8 : h.length + t.length > 7) return null;
  const all = tail === undefined ? h : [...h, ...Array(8 - h.length - t.length).fill("0"), ...t];
  const g = all.map((x) => parseInt(x, 16));
  return g.length === 8 && g.every((x) => Number.isInteger(x) && x >= 0 && x <= 0xffff) ? g : null;
}
/** True only for ordinary public internet addresses. Anything unusual, reserved, mapped or tunnelled is refused. */
export function isPublicIp(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return !blockedV4(ip);
  if (kind !== 6) return false;
  const g = groups6(ip); if (!g) return false;
  const emb = (a: number, b: number) => `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return !blockedV4(emb(g[6], g[7])); // IPv4-mapped
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return !blockedV4(emb(g[6], g[7])); // NAT64
  if ((g[0] & 0xe000) !== 0x2000) return false; // not global unicast (loopback, unspecified, unique-local, link-local, multicast, site-local...)
  if (g[0] === 0x2001 && (g[1] === 0 || g[1] === 0xdb8)) return false; // Teredo, documentation
  if (g[0] === 0x2002) return false; // 6to4 tunnels to arbitrary v4 addresses
  return true;
}
const INTERNAL_SUFFIX = /\.(local|localhost|internal|lan|home|corp|intranet|private|test|example|invalid|onion)$/i;
export function checkHost(url: URL, allowOrigins: string[] = []): string | null {
  if (allowOrigins.includes(url.origin)) return null;
  if (url.protocol !== "https:") return "Only secure (https) web addresses can be read.";
  if (url.username || url.password) return "Addresses with a username or password are not accepted.";
  if (url.port && url.port !== "443") return "Only standard web addresses (no custom port) can be read.";
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) return isPublicIp(host) ? null : "That address points to a private or internal network, so it can’t be read.";
  if (!host.includes(".") || INTERNAL_SUFFIX.test(host) || /^localhost$/i.test(host) || host.length > 253) return "That looks like an internal address, so it can’t be read.";
  if (/^[\d.]+$/.test(host)) return "That is not a valid web address.";
  return null;
}

export type Resolver = (host: string) => Promise<string[]>;
export type Transport = (u: URL, ip: string, headers: Record<string, string>, signal: AbortSignal) => Promise<IncomingMessage>;
const defaultResolver: Resolver = async (h) => (await dns.lookup(h, { all: true, verbatim: true })).map((a) => a.address);
const defaultTransport: Transport = (u, ip, headers, signal) => new Promise((resolve, reject) => {
  const lib = u.protocol === "http:" ? http : https;
  const fam = net.isIP(ip);
  const req = lib.request({ host: u.hostname.replace(/^\[|\]$/g, ""), port: u.port || (u.protocol === "http:" ? 80 : 443), path: u.pathname + u.search, method: "GET", headers, signal, servername: net.isIP(u.hostname) ? undefined : u.hostname,
    agent: false, lookup: (_h: string, _o: unknown, cb: (e: Error | null, a: string, f: number) => void) => cb(null, ip, fam) } as https.RequestOptions, resolve);
  req.on("error", reject); req.end();
});

export type FetchOptions = { maxBytes: number; accept: RegExp; maxRedirects?: number; deadlineMs?: number; resolver?: Resolver; transport?: Transport; testAllowOrigins?: string[]; asBot?: boolean };
export type Fetched = { url: string; status: number; type: string; body: Buffer; redirects: string[] };
export const USER_AGENT = "QrenuviImporter/1.0 (+https://qrenuvi.com; reads one page you asked us to import)";

async function pin(u: URL, o: FetchOptions): Promise<string> {
  const bad = checkHost(u, o.testAllowOrigins); if (bad) throw new FetchError("blocked", bad);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (o.testAllowOrigins?.includes(u.origin)) return net.isIP(host) ? host : "127.0.0.1";
  if (net.isIP(host)) return host;
  let addrs: string[]; try { addrs = await (o.resolver ?? defaultResolver)(host); } catch { throw new FetchError("unreachable", "That website could not be found."); }
  if (!addrs.length) throw new FetchError("unreachable", "That website could not be found.");
  if (!addrs.every(isPublicIp)) throw new FetchError("blocked", "That website resolves to a private or internal network, so it can’t be read.");
  return addrs[0];
}
function readBody(res: IncomingMessage, max: number, signal: AbortSignal): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const enc = String(res.headers["content-encoding"] ?? "").toLowerCase().trim();
    let stream: NodeJS.ReadableStream = res;
    if (enc === "gzip" || enc === "x-gzip") stream = res.pipe(zlib.createGunzip({ maxOutputLength: max + 1 } as zlib.ZlibOptions));
    else if (enc === "deflate") stream = res.pipe(zlib.createInflate({ maxOutputLength: max + 1 } as zlib.ZlibOptions));
    else if (enc === "br") stream = res.pipe(zlib.createBrotliDecompress({ maxOutputLength: max + 1 }));
    else if (enc && enc !== "identity") return reject(new FetchError("type", "That website answered in a format we can’t read."));
    const parts: Buffer[] = []; let n = 0; let wire = 0;
    res.on("data", (c: Buffer) => { wire += c.length; if (wire > max * 4 + 65536) { res.destroy(); reject(new FetchError("size", "That page is too large.")); } });
    stream.on("data", (c: Buffer) => { n += c.length; if (n > max) { res.destroy(); reject(new FetchError("size", "That page is too large.")); return; } parts.push(c); });
    stream.on("end", () => resolve(Buffer.concat(parts)));
    stream.on("error", (e) => reject(e instanceof FetchError ? e : new FetchError("type", "That page could not be read.")));
    res.on("error", () => reject(new FetchError("unreachable", "The connection to that website failed.")));
    signal.addEventListener("abort", () => { res.destroy(); reject(new FetchError("time", "That website took too long to answer.")); }, { once: true });
  });
}

export async function safeFetch(input: string, o: FetchOptions): Promise<Fetched> {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), o.deadlineMs ?? 10_000);
  const redirects: string[] = [];
  try {
    let u: URL; try { u = new URL(input); } catch { throw new FetchError("blocked", "That is not a valid web address."); }
    for (let hop = 0; hop <= (o.maxRedirects ?? 4); hop++) {
      const ip = await pin(u, o);
      let res: IncomingMessage;
      try { res = await (o.transport ?? defaultTransport)(u, ip, { "user-agent": USER_AGENT, accept: o.accept.source.includes("image") ? "image/*" : "text/html,application/xhtml+xml;q=0.9", "accept-encoding": "gzip, deflate, br", "accept-language": "en", connection: "close" }, ctl.signal); }
      catch (e) { if (ctl.signal.aborted) throw new FetchError("time", "That website took too long to answer."); throw e instanceof FetchError ? e : new FetchError("unreachable", "We couldn’t connect to that website."); }
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume(); redirects.push(u.href);
        try { u = new URL(res.headers.location, u); } catch { throw new FetchError("blocked", "That website redirected to an invalid address."); }
        continue;
      }
      if (status === 401 || status === 403 || status === 429) { res.resume(); throw new FetchError("denied", "That website doesn’t allow automatic reading (it asked for a sign-in or refused the request). We don’t work around that. Use the spreadsheet import instead."); }
      if (status < 200 || status >= 300) { res.resume(); throw new FetchError("status", `That website answered with an error (${status}).`); }
      const type = String(res.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
      if (!o.accept.test(type)) { res.resume(); throw new FetchError("type", "That address is not the kind of content we can import."); }
      const len = Number(res.headers["content-length"]); if (Number.isFinite(len) && len > o.maxBytes * 4) { res.resume(); throw new FetchError("size", "That page is too large."); }
      const body = await readBody(res, o.maxBytes, ctl.signal);
      return { url: u.href, status, type, body, redirects };
    }
    throw new FetchError("status", "That website redirected too many times.");
  } finally { clearTimeout(timer); }
}

// ---------- robots.txt (RFC 9309, simplified) ----------
export function robotsAllows(text: string, path: string, token = "qrenuviimporter"): boolean {
  const groups: { agents: string[]; rules: [boolean, string][] }[] = []; let cur: { agents: string[]; rules: [boolean, string][] } | null = null; let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/).slice(0, 2000)) {
    const line = raw.replace(/#.*/, "").trim(); const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === "user-agent") { if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); lastWasAgent = true; continue; }
    lastWasAgent = false;
    if (cur && (k === "allow" || k === "disallow")) cur.rules.push([k === "allow", v]);
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && token.includes(a)));
  const use = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  let best: { len: number; allow: boolean } | null = null;
  for (const g of use) for (const [allow, pat] of g.rules) {
    if (!pat) continue;
    const re = new RegExp("^" + pat.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    if (re.test(path) && (!best || pat.length > best.len || (pat.length === best.len && allow))) best = { len: pat.length, allow };
  }
  return best ? best.allow : true;
}
/** Respect the site owner's robots.txt for our importer. Missing file (4xx) = allowed; unreachable or 5xx = not allowed. */
export async function checkRobots(pageUrl: string, o: Omit<FetchOptions, "maxBytes" | "accept">): Promise<void> {
  let u: URL; try { u = new URL(pageUrl); } catch { throw new FetchError("blocked", "That is not a valid web address."); }
  const bad = checkHost(u, o.testAllowOrigins); if (bad) throw new FetchError("blocked", bad);
  const robots = new URL("/robots.txt", u.origin);
  try {
    const r = await safeFetch(robots.href, { ...o, maxBytes: 200_000, accept: /^text\/|^application\/octet-stream$/, maxRedirects: 3, deadlineMs: 5000 });
    if (!robotsAllows(r.body.toString("utf8"), u.pathname + u.search)) throw new FetchError("robots", "That website’s robots.txt asks automatic tools not to read this page, so we won’t. Use the spreadsheet import instead.");
  } catch (e) {
    if (!(e instanceof FetchError)) throw e;
    if (e.code === "robots") throw e;
    if (e.code === "blocked") throw e;
    if (e.code === "status" && /\((4\d\d)\)/.test(e.message)) return; // no robots file
    if (e.code === "denied" || e.code === "type") return; // 401/403 are handled when the page itself is requested; non-text robots is treated as absent
    throw new FetchError("unreachable", "We couldn’t check that website’s robots.txt, so we didn’t read the page.");
  }
}
