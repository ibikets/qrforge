// Support email sender against a local stand-in for Resend (NOT the real service): request shape, idempotency key, error mapping, disabled gate.
import http from "node:http";
let bad = 0; const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
async function main() {
  const seen: { headers: http.IncomingHttpHeaders; body: Record<string, unknown> }[] = []; let mode = "ok";
  const srv = http.createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    const j = (st: number, o: object) => { res.writeHead(st, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (req.url === "/domains") {
      if (mode === "restricted") return j(401, { name: "restricted_api_key", message: "This API key is restricted to only send emails" });
      if (mode === "rejected") return j(401, { name: "validation_error", message: "API key is invalid" });
      if (mode === "other") return j(200, { data: [{ id: "d2", name: "other.example", status: "verified" }] });
      return j(200, { data: [{ id: "d1", name: "bitzpark.com", status: mode === "unverified" ? "pending" : mode === "failed" ? "failed" : "verified" }] });
    }
    if (req.url === "/domains/d1") return j(200, { records: [{ name: "resend._domainkey", type: "TXT", status: mode === "ok" ? "verified" : "not_started" }, { name: "send", type: "MX", status: "verified" }] });
    if (req.url === "/emails/11111111-1111-1111-1111-111111111111") return j(200, { last_event: "delivered" });
    seen.push({ headers: req.headers, body });
    const send = (s: number, j: object) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(j)); };
    if (mode === "403") return send(403, { message: "The bitzpark.com domain is not verified." });
    if (mode === "429") return send(429, { message: "slow down" });
    if (mode === "500") return send(500, { message: "boom" });
    if (mode === "422") return send(422, { message: "bad" });
    send(200, { id: "msg_123" });
  }).listen(0);
  await new Promise((r) => srv.once("listening", r));
  const port = (srv.address() as { port: number }).port;
  process.env.RESEND_API_URL = `http://127.0.0.1:${port}`; process.env.RESEND_API_KEY = "test_key_not_real"; delete process.env.VERCEL_ENV; delete process.env.EMAIL_SEND_ENABLED;
  const { sendEmail, emailEnabled, senderDomainStatus } = await import("../lib/email");
  const m = { to: "c@example.com", subject: "Re: Hello", text: "Hi", idempotencyKey: "k-1" };
  ok(!emailEnabled(), "off by default outside production (previews send nothing)");
  ok((await sendEmail(m)).ok === false && seen.length === 0, "disabled: refuses and makes no request");
  process.env.EMAIL_SEND_ENABLED = "true";
  const r = await sendEmail(m);
  ok(r.ok && r.id === "msg_123", "sends and returns the provider id");
  const s = seen[0];
  ok(s.headers["idempotency-key"] === "k-1" && s.headers.authorization === "Bearer test_key_not_real", "idempotency key and bearer key sent as headers");
  ok(JSON.stringify(s.body.to) === '["c@example.com"]' && s.body.reply_to === "qrenuvi@bitzpark.com" && /qrenuvi@bitzpark\.com/.test(String(s.body.from)) && !("html" in s.body), "one recipient, support reply-to, plain text only");
  ok(JSON.stringify(s.body).includes("test_key_not_real") === false, "key never in the body");
  for (const [mo, code, retry] of [["403", "sender_not_verified", false], ["429", "rate_limited", true], ["500", "unreachable", true], ["422", "rejected", false]] as const) {
    mode = mo; const x = await sendEmail(m);
    ok(!x.ok && x.code === code && x.retryable === retry, `HTTP ${mo} maps to ${code} (retryable ${retry})`);
  }
  mode = "ok";
  ok(!(await sendEmail({ ...m, subject: "a\r\nBcc: x@y.z" })).ok, "header injection in the subject is refused");
  ok(!(await sendEmail({ ...m, to: "not an email" })).ok, "invalid recipient is refused");
  ok((await senderDomainStatus()).state === "verified", "domain check: verified only when the provider says so");
  mode = "unverified";
  const pend = await senderDomainStatus();
  ok(pend.state === "unverified" && /pending/.test(pend.detail) && /TXT resend\._domainkey/.test(pend.detail) && !/MX send/.test(pend.detail), "pending: names the exact unresolved record and not the verified ones");
  mode = "failed"; ok((await senderDomainStatus()).state === "failed", "failed verification is reported as failed");
  mode = "restricted"; const rs = await senderDomainStatus(); ok(rs.state === "unverified" && /send-only/.test(rs.detail), "send-only key: unverified, not failed, points to the test send");
  mode = "rejected"; ok(/rejected the key/.test((await senderDomainStatus()).detail), "provider rejection is distinguished");
  mode = "other"; ok(/not added in this email account/.test((await senderDomainStatus()).detail), "domain absent from the account is distinguished");
  mode = "ok"; const vv = await senderDomainStatus(); ok(vv.state === "verified" && /Qrenuvi Support <qrenuvi@bitzpark\.com>/.test(vv.detail) && !vv.detail.includes("test_key_not_real"), "verified detail shows From and never the key");
  const { emailStatus } = await import("../lib/email");
  const es = await emailStatus("11111111-1111-1111-1111-111111111111"); ok(es.ok && es.lastEvent === "delivered", "message status read from provider");
  ok(!(await emailStatus("../domains")).ok, "message id is validated before use in a URL");
  process.env.RESEND_API_URL = "http://127.0.0.1:1"; // unreachable
  srv.close();
  console.log(bad ? `${bad} FAILED` : "all passed"); process.exit(bad ? 1 : 0);
}
main();
