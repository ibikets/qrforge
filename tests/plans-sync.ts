// Fails if qrforge.plan_limits in the migration drifts from lib/plans.ts.   Run: npx tsx tests/plans-sync.ts
import fs from "node:fs";
import { PLANS } from "../lib/plans";
const sql = fs.readFileSync(new URL("../supabase/migrations/20261014000000_atomic_limits.sql", import.meta.url), "utf8");
let bad = 0;
for (const [id, p] of Object.entries(PLANS)) {
  const m = new RegExp(`\\('${id}', (\\d+), (true|false), (true|false), (\\d+)\\)`).exec(sql);
  const want = [p.maxSaved, p.types === "all", p.logo, p.maxSize].map(String).join(",");
  const got = m ? [m[1], m[2], m[3], m[4]].join(",") : "missing";
  if (want !== got) { bad++; console.log("FAIL", id, { want, got }); } else console.log("PASS", id, want);
}
const pg = fs.readFileSync(new URL("../supabase/migrations/20261016000000_hosted_pages.sql", import.meta.url), "utf8");
for (const [id, p] of Object.entries(PLANS)) {
  const m = new RegExp(`set max_pages = (\\d+),\\s+max_media_bytes = (\\d+)\\s+where plan = '${id}'`).exec(pg);
  const want = [p.maxPages, p.maxMediaBytes].join(","), got = m ? `${m[1]},${m[2]}` : "missing";
  if (want !== got) { bad++; console.log("FAIL pages", id, { want, got }); } else console.log("PASS pages", id, want);
}
process.exit(bad ? 1 : 0);
