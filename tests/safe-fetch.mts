// SSRF and resource-bound tests for the remote fetcher. Local logic plus real sockets to a local test server (allow-listed origin); no external network.
import http from "node:http";
import zlib from "node:zlib";
import { Readable } from "node:stream";
import { FetchError, checkHost, checkRobots, isPublicIp, robotsAllows, safeFetch, type Transport } from "../lib/net/safe-fetch";
let bad = 0; const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const code = async (p: Promise<unknown>) => { try { await p; return "ok"; } catch (e) { return e instanceof FetchError ? e.code : "OTHER:" + String(e); } };

for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111", "2a00:1450:4009:81f::200e"]) ok(isPublicIp(ip), "public: " + ip);
for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "192.0.2.1", "198.18.0.1",
  "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1", "64:ff9b::7f00:1", "2001:db8::1", "2002:7f00:1::1", "2001:0:4136:e378:8000:63bf:3fff:fdd2", "fec0::1", "not-an-ip", ""]) ok(!isPublicIp(ip), "refused: " + ip);
const hostCases: [string, boolean][] = [["https://example.com/a", true], ["https://shop.example.co.uk/p?x=1", true], ["http://example.com/", false], ["https://127.0.0.1/", false], ["https://127.1/", false], ["https://2130706433/", false],
  ["https://0x7f.0.0.1/", false], ["https://0177.0.0.1/", false], ["https://[::1]/", false], ["https://[::ffff:127.0.0.1]/", false], ["https://[::ffff:a00:1]/", false], ["https://user:pw@example.com/", false], ["https://example.com:8443/", false],
  ["https://localhost/", false], ["https://intranet/", false], ["https://169.254.169.254/latest/meta-data", false], ["https://metadata.google.internal/", false], ["https://printer.local/", false], ["https://10.0.0.5/", false],
  ["https://example.com.localhost/", false], ["https://8.8.8.8/", true], ["ftp://example.com/", false], ["file:///etc/passwd", false], ["javascript:alert(1)", false], ["https://1.2.3/", true]];
for (const [u, want] of hostCases) { let r: string | null; try { r = checkHost(new URL(u)); } catch { r = "bad"; } ok((r === null) === want, `${want ? "allowed" : "refused"}: ${u}`); }

// DNS answers
const body = Buffer.from("<html>ok</html>");
const fakeTransport = (seen: string[], status = 200, headers: Record<string, string> = { "content-type": "text/html" }): Transport => async (u, ip) => { seen.push(u.hostname + "@" + ip); const r = Readable.from([body]) as unknown as import("node:http").IncomingMessage; Object.assign(r, { statusCode: status, headers }); return r; };
{ const seen: string[] = []; const r = await safeFetch("https://shop.example.com/x", { maxBytes: 1000, accept: /html/, resolver: async () => ["93.184.216.34"], transport: fakeTransport(seen) }); ok(r.body.equals(body) && seen[0] === "shop.example.com@93.184.216.34", "connection is pinned to the checked address"); }
ok(await code(safeFetch("https://evil.example.com/", { maxBytes: 1000, accept: /html/, resolver: async () => ["93.184.216.34", "10.0.0.7"], transport: fakeTransport([]) })) === "blocked", "a name with ANY private answer is refused");
ok(await code(safeFetch("https://evil.example.com/", { maxBytes: 1000, accept: /html/, resolver: async () => ["127.0.0.1"], transport: fakeTransport([]) })) === "blocked", "a name resolving to loopback is refused");
ok(await code(safeFetch("https://evil.example.com/", { maxBytes: 1000, accept: /html/, resolver: async () => { throw new Error("nx"); }, transport: fakeTransport([]) })) === "unreachable", "unresolvable name reported plainly");
{ let calls = 0; const rebind = async () => (++calls === 1 ? ["93.184.216.34"] : ["127.0.0.1"]); const seen: string[] = [];
  await safeFetch("https://rebind.example.com/", { maxBytes: 1000, accept: /html/, resolver: rebind, transport: fakeTransport(seen) });
  ok(calls === 1 && seen[0].endsWith("@93.184.216.34"), "DNS rebinding: one lookup, the checked address is the one used"); }
// redirects
{ let hop = 0; const t: Transport = async (u) => { hop++; const r = Readable.from([Buffer.alloc(0)]) as unknown as import("node:http").IncomingMessage; Object.assign(r, { statusCode: 302, headers: { location: hop === 1 ? "https://10.0.0.1/admin" : "https://next.example.com/" } }); return r; };
  ok(await code(safeFetch("https://a.example.com/", { maxBytes: 1000, accept: /html/, resolver: async () => ["93.184.216.34"], transport: t })) === "blocked", "redirect to an internal address is refused");
  hop = 5; const loop: Transport = async () => { const r = Readable.from([Buffer.alloc(0)]) as unknown as import("node:http").IncomingMessage; Object.assign(r, { statusCode: 301, headers: { location: "https://b.example.com/" } }); return r; };
  ok(await code(safeFetch("https://a.example.com/", { maxBytes: 1000, accept: /html/, resolver: async () => ["93.184.216.34"], transport: loop })) === "status", "redirect loops stop after 4 hops");
  const down: Transport = async (u) => { const r = Readable.from([Buffer.alloc(0)]) as unknown as import("node:http").IncomingMessage; Object.assign(r, { statusCode: 302, headers: { location: "http://b.example.com/" } }); return r; };
  ok(await code(safeFetch("https://a.example.com/", { maxBytes: 1000, accept: /html/, resolver: async () => ["93.184.216.34"], transport: down })) === "blocked", "redirect from https to http is refused"); }
for (const [st, want] of [[403, "denied"], [401, "denied"], [429, "denied"], [404, "status"], [500, "status"]] as const) ok(await code(safeFetch("https://a.example.com/", { maxBytes: 1000, accept: /html/, resolver: async () => ["93.184.216.34"], transport: fakeTransport([], st) })) === want, `status ${st} -> ${want}, no workaround attempted`);
ok(await code(safeFetch("https://a.example.com/", { maxBytes: 1000, accept: /html/, resolver: async () => ["93.184.216.34"], transport: fakeTransport([], 200, { "content-type": "application/pdf" }) })) === "type", "wrong content type refused");

// real sockets
const srv = http.createServer((req, res) => {
  const u = req.url ?? "/";
  if (u === "/big") { res.writeHead(200, { "content-type": "text/html" }); const c = Buffer.alloc(64 * 1024, 97); let n = 0; const t = setInterval(() => { if (n++ > 200 || !res.write(c)) { if (n > 200) { clearInterval(t); res.end(); } } }, 1); res.on("close", () => clearInterval(t)); return; }
  if (u === "/bomb") { res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" }); res.end(zlib.gzipSync(Buffer.alloc(80 * 1024 * 1024, 97))); return; }
  if (u === "/slow") { res.writeHead(200, { "content-type": "text/html" }); res.write("<html>"); return; }
  if (u === "/ok") { res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-encoding": "gzip" }); res.end(zlib.gzipSync("<html>hello</html>")); return; }
  if (u === "/redir") { res.writeHead(302, { location: "/ok" }); res.end(); return; }
  if (u === "/robots.txt") { res.writeHead(200, { "content-type": "text/plain" }); res.end("User-agent: *\nDisallow: /private\nAllow: /private/open\n"); return; }
  if (u === "/img") { res.writeHead(200, { "content-type": "image/png" }); res.end(Buffer.from([137, 80, 78, 71])); return; }
  res.writeHead(404); res.end();
});
await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${(srv.address() as import("node:net").AddressInfo).port}`; const T = [origin];
const opt = { maxBytes: 1024 * 1024, accept: /html/, testAllowOrigins: T };
ok(await code(safeFetch(origin + "/ok", { ...opt })) === "ok" && (await safeFetch(origin + "/ok", opt)).body.toString() === "<html>hello</html>", "real socket: gzip page is read and decoded");
ok((await safeFetch(origin + "/redir", opt)).url.endsWith("/ok"), "real socket: same-site redirect followed");
ok(await code(safeFetch(origin + "/big", opt)) === "size", "oversized body stops at the limit");
ok(await code(safeFetch(origin + "/bomb", opt)) === "size", "compression bomb (80 MB inflated) stops at the limit");
{ const t0 = Date.now(); ok(await code(safeFetch(origin + "/slow", { ...opt, deadlineMs: 400 })) === "time" && Date.now() - t0 < 2000, "a server that never finishes is cut off at the deadline"); }
ok(await code(safeFetch(origin + "/img", opt)) === "type", "image where a page was expected is refused");
ok((await safeFetch(origin + "/img", { ...opt, accept: /^image\// })).body.length === 4, "image accepted when images are expected");
ok(await code(safeFetch("http://127.0.0.1:1/", { maxBytes: 100, accept: /html/ })) === "blocked", "without the test allowance, loopback is refused on a real request");
// robots
ok(robotsAllows("User-agent: *\nDisallow: /private\nAllow: /private/open", "/menu") && !robotsAllows("User-agent: *\nDisallow: /private\nAllow: /private/open", "/private/x") && robotsAllows("User-agent: *\nDisallow: /private\nAllow: /private/open", "/private/open"), "robots: longest rule wins");
ok(!robotsAllows("User-agent: QrenuviImporter\nDisallow: /\n\nUser-agent: *\nAllow: /", "/anything"), "robots: our own group is honoured over *");
ok(!robotsAllows("User-agent: *\nDisallow: /", "/x") && robotsAllows("", "/x") && !robotsAllows("User-agent: *\nDisallow: /*.json$", "/a.json"), "robots: disallow-all, empty file, wildcard patterns");
ok(await code(checkRobots(origin + "/private/data", { testAllowOrigins: T })) === "robots", "robots.txt disallow stops the import");
ok(await code(checkRobots(origin + "/menu", { testAllowOrigins: T })) === "ok", "robots.txt allows other pages");
srv.close(); console.log(bad ? `${bad} FAILED` : "ALL PASS"); process.exit(bad ? 1 : 0);
