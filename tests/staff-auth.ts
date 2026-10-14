// Pure helpers behind staff authentication. Label: local.
import { claimsOf, hasPasswordLogin, lastAuthAt, safeStaffNext } from "../lib/staff-auth";
let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const tok = (c: object) => ["e30", Buffer.from(JSON.stringify(c)).toString("base64url"), "s"].join(".");

for (const [v, want] of [
  [null, "/admin"], ["", "/admin"], ["//evil.example", "/admin"], ["https://evil.example/admin", "/admin"], ["/\\evil", "/admin"],
  ["/login", "/admin"], ["/create", "/admin"], ["/admin", "/admin"], ["/admin/payments?x=1", "/admin/payments?x=1"],
  ["/admin/login", "/admin"], ["/admin/login?next=/admin", "/admin"], ["/admin/reset-password", "/admin"], ["/admin/auth/callback", "/admin"],
  ["/staff-invite?token=abc", "/staff-invite?token=abc"], ["/staff-invitex", "/admin"], ["/administrator", "/admin"],
] as const) ok(safeStaffNext(v as string | null) === want, `safeStaffNext(${JSON.stringify(v)}) -> ${want}`);

const t = Math.floor(Date.now() / 1000);
const c = claimsOf(tok({ aal: "aal2", amr: [{ method: "password", timestamp: t - 100 }, { method: "totp", timestamp: t - 50 }] }));
ok(c.aal === "aal2" && hasPasswordLogin(c.amr), "password + totp session is recognised");
ok(Math.abs(lastAuthAt(c.amr) - (t - 50) * 1000) < 1, "step-up clock is the latest password/totp time");
for (const m of ["oauth", "otp", "recovery", "magiclink", "anonymous"]) ok(!hasPasswordLogin(claimsOf(tok({ aal: "aal2", amr: [{ method: m, timestamp: t }, { method: "totp", timestamp: t }] })).amr), `${m} (+ totp) is not a staff sign-in`);
ok(!hasPasswordLogin(claimsOf("garbage").amr) && !hasPasswordLogin(claimsOf(undefined).amr), "garbage or missing token has no methods");
ok(!hasPasswordLogin(claimsOf(tok({ amr: "password" })).amr), "malformed amr is ignored");
ok(lastAuthAt(claimsOf(tok({ amr: [{ method: "oauth", timestamp: t }] })).amr) === 0, "OAuth time never counts as a staff authentication");
console.log(bad ? `${bad} FAILED` : "ALL PASS"); process.exit(bad ? 1 : 0);
