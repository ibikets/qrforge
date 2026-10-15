// Staff file-usage panel (stand-ins): counts and sizes per customer, no names/paths, role-gated.
import { BASE, ctl, staffSession } from "./lib.mjs";
import { IDS, seed } from "./seed-admin.mjs";
let bad = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
await ctl({ reset: true }); await seed();
const get = async (cookie) => { const r = await fetch(BASE + "/admin/pages", { headers: cookie ? { cookie } : {}, redirect: "manual" }); return { s: r.status, t: (await r.text()).replace(/<!--.*?-->/g, "") }; };
const sup = await staffSession(IDS.support, "support@example.com");
const r = await get(sup);
ok(r.s === 200 && /File usage/.test(r.t), "support staff see the File usage panel");
ok(/3 files/.test(r.t) && /1 PDF/.test(r.t) && /2 image/.test(r.t), "totals: 3 files, 1 PDF, 2 images");
ok(/2\.7 MB|2\.8 MB/.test(r.t) || /2\.6 MB/.test(r.t), "the heaviest customer's storage is shown");
ok(!/private-contract|secret\/path/.test(r.t), "no file names or storage paths appear");
ok(/tester@example\.com/.test(r.t), "customer email is shown to staff who may read customers");
const bill = await get(await staffSession(IDS.billing, "billing@example.com"));
ok(!/File usage/.test(bill.t), "a role without page access does not see it");
ok(!/File usage/.test((await get(null)).t), "anonymous visitors do not see it");
console.log(bad ? `${bad} FAILED` : "all passed"); process.exit(bad ? 1 : 0);
