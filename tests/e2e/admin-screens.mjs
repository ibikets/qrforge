import fs from "fs";
import { open, ctl, BASE, SP, staffSession } from "./lib.mjs";
const axeSrc = fs.readFileSync(process.env.AXE_PATH ?? "node_modules/axe-core/axe.min.js", "utf8");
let bad = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const ID = (n) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
import("fs").then((f) => f.mkdirSync(SP + "/admin-shots", { recursive: true }));
await ctl({ reset: true, tables: { staff_members: [
  { user_id: ID(1), email: "owner@example.com", role: "owner", extra_grants: [], state: "active", version: 1 },
  { user_id: ID(3), email: "billing@example.com", role: "billing", extra_grants: [], state: "active", version: 1 } ] },
  rpc: { stats_summary: { users: 0, active_paid: 0, revenue_kobo: 0 }, list_customers: [] } });
const pages = ["/admin", "/admin/customers", "/admin/customers/" + ID(50), "/admin/content", "/admin/plans", "/admin/discounts", "/admin/discounts/new", "/admin/discounts/" + ID(60), "/admin/payments", "/admin/payments/qrf_missing", "/admin/support", "/admin/support/" + ID(70), "/admin/statistics", "/admin/releases", "/admin/staff", "/admin/settings", "/admin/audit", "/admin/audit/" + ID(80), "/admin/security", "/staff-invite?token=bad"];
const widths = [1440, 1024, 768, 390, 320];
const slug = (p) => p.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home";
async function run(label, cookieStr, list, { shotWidths = [1440, 390], axeWidths = [1440, 390] } = {}) {
  for (const w of widths) {
    const { browser, context, page, logs } = await open({ width: w, height: 900 });
    if (cookieStr) { const [n, ...v] = cookieStr.split("="); await context.addCookies([{ name: n, value: v.join("="), domain: "localhost", path: "/" }]); }
    for (const p of list) {
      logs.length = 0;
      const resp = await page.goto(BASE + p, { waitUntil: "networkidle" }).catch((e) => ({ status: () => 0 }));
      const st = resp.status();
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      let ax = [];
      if (axeWidths.includes(w)) { await page.evaluate(axeSrc); ax = await page.evaluate(async () => (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] })).violations.map((x) => x.id + "×" + x.nodes.length)); }
      const errs = logs.filter((l) => !/status of (4|5)\d\d/.test(l));
      ok(st > 0 && st < 500 && over <= 0 && errs.length === 0 && ax.length === 0, `${label} ${p} @${w}: http ${st}, overflow ${over}px, axe ${ax.join(",") || "0"}${errs.length ? ", errors " + errs.join("|") : ""}`);
      if (shotWidths.includes(w)) await page.screenshot({ path: `${SP}/admin-shots/${label}_${slug(p)}_${w}.png`, fullPage: true });
    }
    await browser.close();
  }
}
await run("owner", await staffSession(ID(1), "owner@example.com"), pages);
await run("billing-denied", await staffSession(ID(3), "billing@example.com"), ["/admin/staff", "/admin/settings", "/admin/releases", "/admin/content", "/admin/support", "/admin/audit"]);
await run("no-mfa", await staffSession(ID(1), "owner@example.com", { aal: "aal1" }), ["/admin", "/admin/staff"]);
await run("non-staff", await staffSession(ID(9), "nobody@example.com"), ["/admin"]);
await run("bootstrap", await staffSession(ID(10), "boot@example.com"), ["/admin"]);
await run("anonymous", null, ["/admin", "/admin/customers"]);
console.log(bad ? `${bad} FAILED` : "ALL PASS"); process.exit(bad ? 1 : 0);
