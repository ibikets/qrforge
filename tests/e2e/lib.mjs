import { chromium } from "playwright-core";
export const BASE = "http://localhost:3200";
export const SP = process.env.QRF_SCRATCH ?? "/tmp/qrforge-tests";
export const UID = "11111111-1111-4111-8111-111111111111";
export const ctl = async (b) => (await fetch("http://localhost:54321/__ctl", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b ?? {}) })).json();
export const tx = (reference, t) => fetch("http://localhost:54322/__tx", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reference, tx: t }) });
const b64u = (s) => Buffer.from(s).toString("base64url");
export function sessionCookie() {
  const user = { id: UID, aud: "authenticated", role: "authenticated", email: "tester@example.com", app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {} };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const jwt = [b64u(JSON.stringify({ alg: "HS256", typ: "JWT" })), b64u(JSON.stringify({ sub: UID, exp, role: "authenticated" })), "sig"].join(".");
  const session = { access_token: jwt, refresh_token: "r", expires_in: 3600, expires_at: exp, token_type: "bearer", user };
  return { name: "sb-localhost-auth-token", value: "base64-" + b64u(JSON.stringify(session)), domain: "localhost", path: "/", httpOnly: false, secure: false, sameSite: "Lax" };
}
export async function open({ width = 1440, height = 1000, signedIn = false, reducedMotion } = {}) {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  const context = await browser.newContext({ viewport: { width, height }, acceptDownloads: true, reducedMotion });
  if (signedIn) await context.addCookies([sessionCookie()]);
  const page = await context.newPage();
  const logs = [];
  page.on("console", (m) => { if (m.type() === "error") logs.push("console: " + m.text()); });
  page.on("pageerror", (e) => logs.push("pageerror: " + e.message));
  return { browser, context, page, logs };
}
export const sub = (plan, days, extra = {}) => ({ user_id: UID, plan, current_period_end: new Date(Date.now() + days * 864e5).toISOString(), auto_renew: false, authorization_code: null, ...extra });
/** Session for any stand-in user. aal: "aal1"|"aal2"; lastSignIn: ms epoch (step-up clock). Registers the user in the stand-in. */
export const STAFF_COOKIE = "qrf-staff-auth";
/** Staff-session cookie ("name=value"). methods: how the session was established (staff needs "password"); lastSignIn drives step-up. */
export async function staffSession(id, email, { aal = "aal2", lastSignIn = Date.now(), extra = {}, methods = ["password", "totp"] } = {}) {
  const user = { id, aud: "authenticated", role: "authenticated", email, email_confirmed_at: "2026-01-01T00:00:00Z", last_sign_in_at: new Date(lastSignIn).toISOString(), app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, created_at: "2026-01-01T00:00:00Z", ...extra };
  await ctl({ users: { [id]: user } });
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const jwt = [b64u(JSON.stringify({ alg: "HS256", typ: "JWT" })), b64u(JSON.stringify({ sub: id, exp, role: "authenticated", aal, amr: methods.map((method) => ({ method, timestamp: Math.floor(lastSignIn / 1000) })) })), "sig"].join(".");
  const session = { access_token: jwt, refresh_token: "r", expires_in: 3600, expires_at: exp, token_type: "bearer", user };
  return STAFF_COOKIE + "=base64-" + b64u(JSON.stringify(session));
}
