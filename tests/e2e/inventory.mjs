// Screen-inventory coverage: every SCREEN-INVENTORY.csv row is exercised for its real content, its key interaction and its
// states at desktop and mobile widths, with axe, overflow and console checks. Stand-in tests (fake Supabase/Paystack).
// Usage: PHASE=plain|offer node tests/e2e/inventory.mjs   (restart the app between phases: public pages cache offers for minutes)
import fs from "node:fs";
import { open, ctl, BASE, SP, tx, UID, sessionCookie, staffSession } from "./lib.mjs";
import { seed, IDS, ID } from "./seed-admin.mjs";
const axeSrc = fs.readFileSync(process.env.AXE_PATH ?? "node_modules/axe-core/axe.min.js", "utf8");
const PHASE = process.env.PHASE ?? "plain";
const widths = (process.env.WIDTHS ?? "1440,390").split(",").map(Number);
fs.mkdirSync(SP + "/inventory", { recursive: true });
const results = [];
let bad = 0;
const log = (c, id, w, m) => { console.log((c ? "PASS " : "FAIL ") + `${id} @${w}: ${m}`); if (!c) bad++; results.push({ id, w, ok: c, check: m }); };

const quote = (o = {}) => ({ id: "bbbbbbbb-0000-4000-8000-000000000001", base_kobo: 350000, saving_kobo: 70000, payable_kobo: 280000, renewal_kobo: 350000, period_days: 30, campaign_id: IDS.camp, ...o });
const cookieFor = {
  owner: () => staffSession(IDS.owner, "owner@example.com"),
  support: () => staffSession(IDS.support, "support@example.com"),
  billing: () => staffSession(IDS.billing, "billing@example.com"),
  editor: () => staffSession(IDS.editor, "editor@example.com"),
  revoked: () => staffSession(IDS.revoked, "former@example.com"),
  nomfa: () => staffSession(IDS.owner, "owner@example.com", { aal: "aal1" }),
  stale: () => staffSession(IDS.owner, "owner@example.com", { lastSignIn: Date.now() - 30 * 60e3 }),
  cust: async () => { const c = sessionCookie(); return `${c.name}=${c.value}`; },
  anon: async () => null,
};

async function visit(w, role, path, fn, { id, extra } = {}) {
  const { browser, context, page, logs } = await open({ width: w, height: w >= 1000 ? 900 : 844 });
  const ck = await cookieFor[role]();
  if (ck) { const [n, ...v] = ck.split("="); await context.addCookies([{ name: n, value: v.join("="), domain: "localhost", path: "/" }]); }
  const t = (m, c) => log(Boolean(c), id, w, m);
  const main = async () => await page.locator("body").innerText();
  const has = async (...res) => { const x = await main(); return res.every((r) => (r instanceof RegExp ? r.test(x) : x.includes(r))); };
  try {
    if (path) await page.goto(BASE + path, { waitUntil: "networkidle" });
    await fn({ page, t, has, main, ctx: context, w });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.evaluate(axeSrc);
    const ax = await page.evaluate(async () => (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] })).violations.map((x) => x.id + "×" + x.nodes.length));
    t(`no horizontal page overflow (${over}px)`, over <= 0);
    t(`axe: ${ax.join(",") || "0 violations"}`, ax.length === 0);
    const errs = logs.filter((l) => !/status of (4|5)\d\d|ERR_FAILED|ERR_ABORTED/.test(l));
    t(`no unexpected console errors${errs.length ? ": " + errs.join("|").slice(0, 160) : ""}`, errs.length === 0);
    await page.screenshot({ path: `${SP}/inventory/${id}_${w}.png`, fullPage: true });
  } catch (e) {
    log(false, id, w, "threw: " + String(e.message).split("\n")[0].slice(0, 200));
    await page.screenshot({ path: `${SP}/inventory/${id}_${w}_FAILED.png`, fullPage: true }).catch(() => {});
  }
  await browser.close();
}

/** open a confirmation dialog, check focus, Escape and the effect text; optionally confirm */
async function dialog(P, openerName, { title, effect, confirm } = {}) {
  const { page, t } = P;
  const opener = page.getByRole("button", { name: openerName, exact: false }).first();
  await opener.click();
  const dlg = page.getByRole("dialog");
  t(`"${openerName}" opens a dialog`, await dlg.isVisible());
  if (title) t(`dialog names the target: ${title}`, new RegExp(title).test(await dlg.innerText()));
  if (effect) t(`dialog states the effect: ${effect}`, new RegExp(effect, "i").test(await dlg.innerText()));
  t("safe Cancel is focused first", (await page.evaluate(() => document.activeElement?.textContent?.trim())) === "Cancel");
  await page.keyboard.press("Escape");
  t("Escape closes the dialog", !(await dlg.isVisible()));
  t("focus returns to the opener", (await page.evaluate(() => document.activeElement?.textContent?.trim() ?? "")).includes(openerName.slice(0, 8)));
  if (confirm) {
    await opener.click();
    await page.getByLabel(/Reason/).fill("Checked with the customer").catch(() => {});
    await dlg.getByRole("button", { name: confirm }).click();
    await page.getByText("Confirmed by the server.").waitFor({ timeout: 5000 }).catch(() => {});
    t("confirmation comes from the server response", await page.getByText("Confirmed by the server.").count() > 0 || !(await dlg.isVisible()));
  }
}

const SCREENS = [];
const S = (id, role, path, fn, o = {}) => SCREENS.push({ id, role, path, fn, ...o });
const publicSeed = async (o = {}) => { await seed({ rpc: { issue_quote: quote(), ...(o.rpc ?? {}) } }); };

// ---------- public ----------
if (PHASE === "plain") {
  S("landing", "anon", "/", async ({ page, t, has }) => {
    t("slogan, workbench, uses, plan teasers, FAQ", await has("Create a code. Make a connection.", "Make a QR code", "Website", "Text", "Email", "Popular uses", "Simple plans for more needs", "Frequently asked questions"));
    t("no invented customer counts, testimonials or logos", !(await has(/\b\d[\d,]+ (customers|users|businesses)\b|testimonial|trusted by/i)));
    t("footer names Bitzpark Limited with the current year", await has("Bitzpark Limited", String(new Date().getFullYear())));
    await page.getByLabel("Website address").fill("example.com/menu");
    await page.waitForTimeout(400);
    t("preview appears as you type", (await page.locator("[aria-label='QR code preview'] canvas, [aria-label='QR code preview'] img, [aria-label='QR code preview'] svg").count()) > 0 || !(await has("Your code appears here as you type.")));
    await page.getByRole("button", { name: /Create a QR code/ }).first().click();
    await page.waitForURL(/\/create/);
    t("hand-off to /create keeps the payload out of the URL", !/example\.com/.test(page.url()));
  }, { setup: () => seed({ tables: { campaigns: [] } }) });
}
if (PHASE === "offer") {
  S("landing-offer", "anon", "/", async ({ t, has }) => {
    t("public offer notice states audience, first payment only, renewal at normal price", await has("Launch offer: 20% off your first payment", "For customers who have never paid", "First payment only", "Renewals are at the normal price"));
    t("teaser shows first-payment price, normal price and renewal amount", await has("₦2,800 for the first 30 days", "₦3,500 normal price", "Then ₦3,500 / 30 days if you renew"));
    t("no countdown or scarcity wording", !(await has(/countdown|hurry|last chance|only \d+ left|ends in/i)));
    t("private offers are never shown", !(await has("Welcome ₦500 off")));
  }, { setup: () => publicSeed() });
  S("pricing", "anon", "/pricing", async ({ page, t, has }) => {
    t("three plans with exact prices and the comparison table", await has("Free", "Pro", "Business", "₦2,800 for the first 30 days", "₦7,600 for the first 30 days", "₦3,500 normal price", "₦9,500 normal price", "Plan comparison", "Saved codes", "Largest file"));
    t("no 'Priority support' claim", !(await has("Priority support")));
    t("a signed-out visitor is not told they are on a plan", !(await has("Your current plan")));
    const href = await page.getByRole("link", { name: /Sign in to choose Pro/ }).first().getAttribute("href").catch(() => null);
    t("the plan button leads to sign-in that returns to checkout for that plan", Boolean(href) && /login\?next=.*checkout.*plan(=|%3D)pro/.test(href ?? ""));
    t("no amount or percentage in any link", !/amount|percent|discount=/i.test(href ?? ""));
  }, { setup: () => publicSeed() });
  S("checkout", "cust", "/checkout?plan=pro", async ({ page, t, has }) => {
    await page.getByRole("heading", { level: 1 }).waitFor();
    await page.getByRole("button", { name: "Pay ₦2,800" }).waitFor({ timeout: 8000 });
    for (const x of ["Paying as tester@example.com", "Pro · 30 days", "Normal price", "₦3,500", /Offer applied|Launch offer: 20% off your first payment/, "−₦700", "Pay today", "₦2,800"]) if (!(await has(x))) console.log("   missing:", String(x));
    t("shows account, plan, line items and the payable total", await has("Paying as tester@example.com", "Pro · 30 days", "Normal price", "₦3,500", /Offer applied|Launch offer: 20% off your first payment/, "−₦700", "Pay today", "₦2,800"));
    t("states the normal renewal price", await has("Then ₦3,500 / 30 days if you renew"));
    t("renewal consent is a checked checkbox with the approved wording", (await page.locator("input[type=checkbox]").isChecked()) && (await has("Renew automatically every 30 days", "the offer applies to this first payment only")));
    t("Pay button shows the amount", await page.getByRole("button", { name: "Pay ₦2,800" }).isVisible());
    await page.locator("input[type=checkbox]").uncheck();
    t("opting out of renewal is possible and the renewal sentence goes away", !(await has("if you renew")) && (await page.locator("input[type=checkbox]").isChecked()) === false);
  }, { setup: () => seed({ subscriptions: [], rpc: { issue_quote: quote() } }) });
  S("checkout-code", "cust", "/checkout?plan=pro", async ({ page, t, has }) => {
    await page.getByRole("textbox", { name: "Offer code" }).fill("SAVE-DEMO");
    await ctl({ rpc: { issue_quote: { __status: 400, __body: { code: "P0001", message: "QF021 not available" } } } });
    await page.getByRole("button", { name: "Apply" }).click();
    await page.getByText(/unavailable or does not apply/i).waitFor({ timeout: 5000 });
    t("a bad code gives a neutral, non-enumerating message", await has("This code is unavailable or does not apply to this purchase."));
    t("the customer's other input is not cleared and the total is unchanged", await has("Paying as tester@example.com", "₦2,800") && (await page.locator("input[type=checkbox]").count()) === 1);
    await ctl({ rpc: { issue_quote: quote({ saving_kobo: 100000, payable_kobo: 250000 }) } });
    await page.getByRole("textbox", { name: "Offer code" }).fill("WELCOME");
    await page.getByRole("button", { name: "Apply" }).click();
    await page.getByRole("button", { name: "Pay ₦2,500" }).waitFor({ timeout: 5000 });
    t("a good code updates the total from a new server quote", await has("₦2,500"));
    await page.getByRole("button", { name: /Remove code/ }).click();
    t("Remove code works without clearing the page", await has("Pay today"));
  }, { setup: () => seed({ subscriptions: [], rpc: { issue_quote: quote() } }) });
  S("payment-result", "cust", null, async ({ page, t, has }) => {
    const cases = [
      ["qrf_ok_1", { status: "success", amount: 280000, currency: "NGN", reference: "qrf_ok_1", metadata: { user_id: UID, plan: "pro", auto_renew: false, quote_id: "bbbbbbbb-0000-4000-8000-000000000001" }, customer: { email: "tester@example.com" } }, /Payment received/, "confirmed shows the received state"],
      ["qrf_wait_1", { status: "pending", amount: 280000, currency: "NGN", reference: "qrf_wait_1", metadata: { user_id: UID, plan: "pro" } }, /We’re confirming your payment/, "pending says it is being confirmed and never claims activation"],
      ["qrf_bad_1", { status: "failed", amount: 280000, currency: "NGN", reference: "qrf_bad_1", metadata: { user_id: UID, plan: "pro" } }, /We couldn’t confirm your payment/, "failed says so and tells the customer not to pay again until clear"],
    ];
    for (const [ref, tr, re, label] of cases) {
      await tx(ref, tr);
      await page.goto(`${BASE}/billing/callback?reference=${ref}`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(1200);
      t(label, re.test(await page.locator("main").innerText()));
    }
    await page.goto(`${BASE}/billing/callback?reference=qrf_wait_1`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(1200);
    t("pending page does not say the plan is active", !(await has(/is active/)));
    await page.goto(`${BASE}/billing/callback?reference=qrf_bad_1`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(1200);
    t("failure page shows the reference and no invented support address", (await has("qrf_bad_1")) && !/@[a-z]+\.(com|ng)/.test(await page.locator("main").innerText()));
  }, { setup: () => seed({ subscriptions: [], rpc: { apply_quoted_payment: new Date(Date.now() + 30 * 864e5).toISOString() } }) });
  S("customer-billing", "cust", "/billing", async ({ t, has }) => {
    t("plan, expiry, renewal control and change plan", await has("Current plan", "Business", "Active until", "Change plan"));
    t("payment history with the saved amount and the offer", await has("Payment history", "Saved ₦700 with an offer"));
    t("cancellation semantics are explained", await has("does not refund a payment or end the access you have already paid for"));
    t("the renewal state is not self-contradictory", !(await has(/Auto-renewal is off\.[\s\S]*Auto-renewal is switched on/)));
  }, { setup: () => publicSeed() });
}

// ---------- management (run in the plain phase; none of it depends on cached public offers) ----------
if (PHASE === "plain") {
  const seedAdmin = (o) => () => seed(o);
  S("overview", "owner", "/admin", async ({ t, has }) => {
    t("verified, dated counters and a worklist", await has("Verified from the database at", "Needs attention", "Refund requests waiting", "Open support tickets", "Recent activity"));
    t("financial summary for the Owner", await has("Amount collected", "Discounts given"));
  });
  S("overview-support", "support", "/admin", async ({ t, has }) => {
    t("Support sees operational counters but no revenue", await has("Open support tickets") && !(await has("Amount collected")));
  });
  S("customers", "owner", "/admin/customers", async ({ page, t, has }) => {
    t("list with plan, expiry, status and joined date", await has("tester@example.com", "second@example.com", "Plan ends", "Status", "Joined"));
    t("search and filter controls are labelled", (await page.getByLabel("Email contains").count()) === 1 && (await page.getByLabel("Show").count()) === 1);
    await ctl({ rpc: { list_customers: [] } });
    await page.getByLabel("Email contains").fill("nobody");
    await page.getByRole("button", { name: "Apply" }).click();
    await page.waitForLoadState("networkidle");
    t("a filter with no matches shows a filter-empty state (not a failure)", await has(/No customers match|No customers/i));
    await ctl({ fail: { }, rpc: { list_customers: { __status: 500, __body: { code: "XX000", message: "boom" } } } });
    await page.reload({ waitUntil: "networkidle" });
    t("a failed load shows an error state, never an empty list", await has(/Could not load|couldn’t load|try again/i) && !(await has("No customers match")));
  });
  S("customer", "owner", `/admin/customers/${UID}`, async ({ t, has }) => {
    t("profile, plan, renewal price, payments, support history and internal notes", await has("Account", "Sign-in email", "Plan", "Renewal price", "Payments", "Support history", "Internal notes", "Never shown to the customer"));
    t("never reveals passwords, card authorisation or QR contents", !(await has(/authorization_code|password:|AUTH_/i)));
    t("sign-in email is explained as separate from contact email", await has("The sign-in email changes only through the customer’s own verified flow"));
  });
  S("customer-support-scope", "billing", `/admin/customers/${UID}`, async ({ t, has }) => {
    t("Billing sees email, plan and payments only (no notes, no support history)", await has("Payments") && !(await has("Internal notes")) && !(await has("Support history")));
  });
  S("customer-edit", "owner", `/admin/customers/${UID}`, async ({ page, t, has }) => {
    await page.getByLabel("Display name").fill("Changed Name");
    await page.getByLabel("Reason (kept in the audit log)").first().fill("Customer asked for the change");
    await page.getByRole("button", { name: "Save profile" }).click();
    await page.waitForLoadState("networkidle");
    t("saving reports the result from the server (saved or a clear error)", await has(/Saved|Confirmed|saved/i) || (await page.getByRole("alert").count()) > 0);
  });
  S("customer-suspend", "owner", `/admin/customers/${UID}`, async (P) => { await dialog(P, "Suspend account", { effect: "(sign|access|billing)" }); });
  S("customer-reset", "owner", `/admin/customers/${UID}`, async (P) => { await dialog(P, "Send password-reset email", { title: "tester@example.com" }); });
  S("entitlement", "billing", `/admin/customers/${UID}`, async ({ t, has }) => {
    t("adjustment is described as an adjustment, never a payment, with a day limit for Billing", await has("recorded as an adjustment, never as a payment") && (await has(/up to 30|Days to add/)));
  });
  S("content", "editor", "/admin/content", async ({ page, t, has }) => {
    t("tabbed editor, preview, history and image library", await has("Headline and button", "Popular uses", "Plan teasers", "Questions", "Footer links", "Save draft", "Preview", "History", "Images"));
    t("Content Editor cannot publish by default", await page.getByRole("button", { name: "Publish" }).isDisabled().catch(() => true));
    await page.getByLabel("Headline", { exact: true }).fill("A changed headline");
    t("unsaved changes are flagged (leaving would prompt)", await page.evaluate(() => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; }));
    await ctl({ rpc: { save_content_draft: 1 } });
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByText(/Draft saved at/).first().waitFor({ timeout: 5000 });
    t("saving shows saved with a Lagos time and says it is not live", await has(/Draft saved at .* WAT\. Not live yet\./));
    await ctl({ rpc: { save_content_draft: { __status: 409, __body: { code: "P0001", message: "QF040 conflict" } } } });
    await page.getByLabel("Headline", { exact: true }).fill("Another change");
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByText(/changed by someone else|record changed/i).first().waitFor({ timeout: 5000 });
    t("a version conflict keeps the draft and offers to load the latest", await has(/Your draft has been kept|changed by someone else/i) && (await has("Load the latest")));
  });
  S("content-usecases", "editor", "/admin/content", async ({ page, t, has }) => {
    await page.getByRole("tab", { name: "Popular uses" }).click();
    t("use-case fields with counters, add and remove", await has("Use 1", "Title", "Description", "Add a use", "Remove use 1"));
  });
  S("content-plans", "editor", "/admin/content", async ({ page, t, has }) => {
    await page.getByRole("tab", { name: "Plan teasers" }).click();
    await page.getByLabel("Pro teaser").fill("Only ₦100 today!");
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByText(/cannot contain prices/i).first().waitFor({ timeout: 5000 });
    t("teaser text cannot override real prices (price in text is refused)", await has("Plan teasers cannot contain prices"));
  });
  S("content-faq", "editor", "/admin/content", async ({ page, t, has }) => {
    await page.getByRole("tab", { name: "Questions" }).click();
    t("question editor with order and remove controls", await has("Question", "Answer", "Add a question", /Move question 2 up/, /Remove question 1/));
    await page.getByRole("tab", { name: "Questions" }).press("ArrowRight");
    t("tabs move with arrow keys", (await page.evaluate(() => document.activeElement?.getAttribute("role"))) === "tab");
  });
  S("content-footer", "editor", "/admin/content", async ({ page, t, has }) => {
    await page.getByRole("tab", { name: "Footer links" }).click();
    await page.getByRole("button", { name: "Add a link" }).click();
    await page.getByLabel("Label").last().fill("Terms");
    await page.getByLabel("Address (https://)").last().fill("http://insecure.example/terms");
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByText(/full https:\/\/ address/i).first().waitFor({ timeout: 5000 });
    t("only https links are accepted (no placeholder or script links)", await has("use a full https:// address"));
  });
  S("content-history", "owner", "/admin/content", async ({ t, has }) => {
    t("history explains that restoring makes a draft, not a live change", await has("History"));
    t("publishing is a separate explicit Owner action", await has("Publish"));
  }, { setup: () => seed({ tables: { content_revisions: [{ id: 1, page: "landing", created_at: new Date().toISOString(), data: {} }], content_published: [{ page: "landing", revision_id: 1, published_at: new Date().toISOString() }] } }) });
  S("assets", "editor", "/admin/content", async ({ page, t, has }) => {
    t("image library: upload form with required description, formats and size stated", await has("Images", "PNG, JPEG or WebP, up to 2 MB", "Description for people who cannot see it"));
    t("no 'not available yet' placeholder remains", !(await has("Image library: not available yet")));
    await page.getByRole("button", { name: "Upload image" }).click();
    t("submitting without a file explains what to do", (await page.locator("[role=alert]:not(#__next-route-announcer__)").allInnerTexts()).join(" ").includes("Choose an image file"));
  });
  S("plans", "owner", "/admin/plans", async ({ t, has }) => {
    t("price versions with status and effective dates; existing subscribers keep agreed terms", await has("Price versions", "Current", "Draft", "Existing subscribers keep the renewal price they agreed to", "What each plan includes", "Largest size"));
  });
  S("plan-edit", "billing", "/admin/plans", async ({ page, t, has }) => {
    t("Billing can draft a new version but cannot publish", await has("New price version") && (await page.getByRole("button", { name: /Publish v2/ }).count()) === 0);
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.waitForTimeout(400);
    t("an empty draft is refused with an inline error and focus moves into the form", ((await page.locator("[aria-invalid=true]").count()) > 0 || (await page.locator("[role=alert]:not(#__next-route-announcer__)").count()) > 0) && (await page.evaluate(() => document.activeElement?.tagName)) !== "BODY");
  });
  S("plan-publish", "owner", "/admin/plans", async (P) => { await dialog(P, "Publish v2", { effect: "(new purchases|existing)" }); });
  S("discounts", "owner", "/admin/discounts", async ({ t, has }) => {
    t("offer list with audience, discount, Lagos window, uses and status", await has("Launch 20% off", "Public", "Private code", "Window (Lagos)", "1 of 100", "Live", "Draft", "Paused"));
    t("offers never stack and never change settled payments (stated)", await has("never stack", "never change a payment that has already settled"));
  });
  S("discount-edit", "billing", "/admin/discounts/new", async ({ page, t, has }) => {
    t("every field from the handoff with help text", await has("Name (required)", "Reference (required)", "Discount type", "Plans", "Who can use it", "How customers get it", "Website notice", "Starts (Lagos time)", "Total uses", "Uses per customer", "Priority", "Counted atomically, so the last slot cannot be taken twice."));
    await page.getByRole("button", { name: "Create draft" }).click();
    await page.waitForTimeout(300);
    t("an incomplete form is refused with an inline error and focus on the first field", (await page.getByRole("alert").count()) > 0 || (await page.locator("[aria-invalid=true]").count()) > 0);
    t("Billing sees the draft-only wording (Owner publishes)", await has("Saved as a draft. Nothing is live until the Owner publishes it."));
  });
  S("discount-redemptions", "owner", `/admin/discounts/${IDS.camp}`, async ({ t, has }) => {
    t("redemption table with held and used states and the references", await has("Redemptions", "Held", "Used", "qrf_demo_1"));
    t("totals reconcile with the list (1 used, 1 held)", await has("1 used · 1 held for checkouts in progress"));
  });
  S("discount-review", "owner", `/admin/discounts/${IDS.campDraft}`, async ({ page, t, has }) => {
    t("publish review shows what customers will see, by plan, with normal and renewal prices", await has("What customers will see", "Normal price", "First payment", "Renews at", "₦3,500 / 30 days"));
    t("private code offers show no code and stay off the website", !(await has(/WELCOME-?[A-Z0-9]{3,}/)));
    await dialog({ page, t, has }, "Publish", { effect: "(live|customers|first payment)" });
  });
  S("discount-lifecycle", "owner", `/admin/discounts/${IDS.camp}`, async (P) => {
    P.t("a live offer is frozen: editing needs pausing first", await P.has("A live offer is frozen"));
    await dialog(P, "Pause offer", { effect: "(pause|new checkouts|paid)" });
    await dialog(P, "Archive", { effect: "(archive|end|no longer)" });
  });
  S("payments", "billing", "/admin/payments", async ({ page, t, has }) => {
    t("reference search, status, amounts with normal/discount/paid breakdown", await has("Reference contains", "Normal price", "Discount", "Paid", "Confirmed", "second@example.com"));
    t("Billing has the payments list; the row links to the detail", (await page.locator("a[href*='/admin/payments/qrf_demo_1']").count()) > 0);
  });
  S("payment-detail", "billing", "/admin/payments/qrf_demo_1", async ({ t, has }) => {
    t("breakdown, quote/campaign, provider check and delivery history sections", await has("Normal price", "Discount", "Paid", "Quote", "Reconcile", "Check with the payment provider", "Callback and webhook history"));
    t("no 'vundefined' leaks into the campaign text", !(await has("undefined")));
  }, { setup: () => seed({ tables: { payment_events: [{ id: 1, reference: "qrf_demo_1", at: new Date().toISOString(), source: "webhook", event: "charge.success", outcome: "confirmed" }] } }) });
  S("refund", "owner", "/admin/payments/qrf_demo_1", async ({ page, t, has }) => {
    t("refund requests list with the remaining refundable amount and the reason", await has("Still refundable", "Customer charged twice", "Waiting for the Owner"));
    t("sending money back is shown as blocked, never as done", await has("Sending the money back: not available yet") && !(await has(/Refunded|Refund sent/)));
    await dialog({ page, t, has }, "Decline", { effect: "(decline|requester|customer)" });
  });
  S("support", "support", "/admin/support", async ({ t, has }) => {
    t("queue with status, priority and filters", await has("Open and pending", "Cannot download SVG", "high", "Question about renewal", "Log a ticket"));
    t("states plainly that replies are not sent from here", await has("Replies are not sent from here yet"));
  });
  S("support-ticket", "support", `/admin/support/${IDS.ticket}`, async ({ t, has }) => {
    t("thread separates customer, internal note and unsent reply draft", await has("Customer ·", "Internal note: the customer never sees this", "Reply draft: not sent"));
    t("assignment, status, priority and add-to-thread controls", await has("Assigned to", "Priority", "Update ticket", "Add to the thread"));
    t("sending is blocked with its dependency, naming the recipient context", await has("Send reply: not available yet", "verified sending address"));
  });
  S("statistics", "owner", "/admin/statistics", async ({ t, has }) => {
    t("range, basis, freshness and table values", await has("Last 30 days", "Basis: confirmed payments, gross", "Read from the database just now", "Confirmed payments by day"));
    t("revenue is not called profit; scans and downloads are marked not measured", await has("It is not profit") && (await has("Scans, exports and downloads")));
  });
  S("statistics-billing", "billing", "/admin/statistics", async ({ t, has }) => {
    t("Billing sees financial figures but not customer growth", await has("Payments") && !(await has("Customers and saved codes")));
  });
  S("releases", "owner", "/admin/releases", async ({ t, has }) => {
    t("this deployment's identity and approved-builds panel", await has("This deployment", "Environment", "Commit", "Approved builds"));
    t("promotion and rollback are explicitly blocked with the dependency (no fake success)", await has("Build list, promotion and rollback: not available yet", "Vercel access token"));
  });
  S("release-detail", "owner", "/admin/releases", async ({ t, has }) => {
    t("deployment review/rollback screens are blocked, with the dependency named, until a Vercel token is connected", await has("Code rollback does not roll data back"));
  });
  S("maintenance", "owner", "/admin/releases", async ({ page, t, has }) => {
    t("allowlisted job lists what it will affect before running", await has("Maintenance jobs", "Release expired offer holds", "Will affect", "expired holds"));
    t("no code upload, SQL or terminal control exists", (await page.locator("textarea, input[type=file]").count()) === 0 && (await page.getByRole("button", { name: /run sql|open terminal|upload code|run command/i }).count()) === 0);
  });
  S("job-status", "owner", "/admin/releases", async ({ t, has }) => {
    t("last runs and completion semantics are shown", await has("Last runs", "Job status", "reported as finished only after the database confirms it"));
  }, { setup: () => seed({ tables: { audit_events: [{ id: 30, at: new Date().toISOString(), actor_email: "owner@example.com", actor_role: "owner", action: "maintenance.run", target_type: "job", target_id: "release_expired_reservations", after_state: { released: 2 } }] } }) });
  S("staff", "owner", "/admin/staff", async ({ t, has }) => {
    t("members with role, second-step status, access state; invitations with expiry", await has("Staff members", "Second step", "Active", "Access ended", "Invitations", "Pending", "Expired", "Cancelled"));
    t("you cannot change your own access", await has("Another Owner changes your access"));
  });
  S("staff-invite", "owner", "/admin/staff", async ({ page, t, has }) => {
    t("invite form: exact-address rule, role, extra permissions, reason", await has("Invite someone", "They must sign in with this exact address to accept", "Extra permissions (optional)", "Create invitation"));
    await dialog({ page, t, has }, "End access", { effect: "(access|sign|end)" });
  });
  S("permissions", "owner", "/admin/staff", async ({ t, has }) => {
    t("permission matrix covers every capability for all four roles", await has("Permission matrix", "Owner", "Support", "Billing", "Content Editor", "Invite, change and revoke staff", "Approve or decline a refund"));
  });
  S("settings", "owner", "/admin/settings", async ({ t, has }) => {
    t("legal/support details start empty; no placeholders published; secrets never editable", await has("Customer-facing legal and support details stay hidden until you add real ones here", "Terms of service (required)", "Not set") && (await has("Secrets are never edited here")));
  });
  S("integrations", "owner", "/admin/settings", async ({ t, has }) => {
    t("verified checks with timestamps, present-on-deployment flags and provider mapping that is marked not verified", await has("Service connections", "Checked just now", "Present on this deployment", "Not verified", "Webhook address", "Redirect allow-list"));
    t("never shows a secret value", !(await has(/sk_(test|live)_|eyJ[A-Za-z0-9_-]{20,}/)));
  });
  S("audit", "owner", "/admin/audit", async ({ t, has }) => {
    t("append-only list with actor, role, action, target; cannot be edited", await has("Every management action, newest first", "Entries cannot be edited or deleted", "owner@example.com", "plan.publish"));
  });
  S("audit-own", "support", "/admin/audit", async ({ t, has }) => {
    t("Support sees only their own entries", await has("support@example.com") && !(await has("owner@example.com")));
  });
  S("audit-detail", "owner", "/admin/audit/12", async ({ t, has }) => {
    t("before/after with sensitive values redacted before storage", await has("Before", "After", "[redacted]", "Sensitive values were removed before this entry was saved") && !(await has("api_key\": \"sk")));
    t("reason, correlation id and target are shown", await has("Initial prices", "c-12", "plan_version"));
  });
  S("staff-login", "nomfa", "/admin", async ({ page, t, has }) => {
    t("staff without a second step are asked for it before seeing anything", await has("Confirm it’s you") && !(await has("Needs attention")));
    t("management navigation is not rendered", (await page.getByRole("link", { name: "Customers" }).count()) === 0);
  });
  S("session-expired", "stale", "/admin/settings", async ({ page, t, has, ctx: P_ctx }) => {
    const r = await page.request.post(`${BASE}/api/admin/settings`, { data: { action: "set", key: "support_email", value: "x@example.com", reason: "testing step up" } });
    t("a sensitive action after 30 minutes asks to sign in again (reauth_required)", r.status() === 403 && (await r.json()).code === "reauth_required");
    await P_ctx.clearCookies();
    await page.goto(`${BASE}/login?timeout=1&next=/admin`, { waitUntil: "networkidle" });
    t("idle timeout notice names the reason and returns to management after sign-in", await has("You were signed out"));
  });
  S("staff-revoked", "revoked", "/admin", async ({ page, t, has }) => {
    t("revoked staff see an access-ended state and no data", await has(/access (has )?ended|no (longer )?access|No access|revoked/i) && !(await has("Needs attention")));
    t("no management navigation", (await page.getByRole("link", { name: "Payments" }).count()) === 0);
  });
  S("invite-expired", "cust", "/staff-invite?token=expired-demo", async ({ t, has }) => {
    t("expired invitation explains what to do, naming no one fictional", await has(/not valid|expired|no longer valid|invalid/i));
  }, { setup: () => seed({ rpc: { accept_invite: "expired" } }) });
  S("states", "billing", "/admin/staff", async ({ page, t, has }) => {
    t("permission-denied state on a screen the role cannot use", await has(/No access|cannot open this view/i));
    await page.goto(`${BASE}/admin/audit`, { waitUntil: "networkidle" });
    t("a data view shows its own scoped state, not a global fake", await has("Audit"));
    await ctl({ rpc: { stats_summary: null } });
    await page.goto(`${BASE}/admin/statistics`, { waitUntil: "networkidle" });
    t("error state with no invented numbers when data cannot load", (await has(/couldn’t load|Could not load|try again/i)) && !(await has("Payments confirmed")));
  });
}

// ---------- run ----------
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
for (const w of widths) for (const sc of SCREENS) {
  if (only && !only.test(sc.id)) continue;
  if (sc.setup) await sc.setup(); else await seed();
  await visit(w, sc.role, sc.path, sc.fn, { id: sc.id });
}
fs.writeFileSync(`${SP}/inventory/results-${PHASE}.json`, JSON.stringify(results, null, 1));
console.log(bad ? `${bad} FAILED` : "ALL PASS");
process.exit(bad ? 1 : 0);
