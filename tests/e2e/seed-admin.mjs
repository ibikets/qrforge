// Seeds the stand-in with fictional records so every management screen renders a populated state. Test-only data.
import { ctl, UID } from "./lib.mjs";
export const ID = (n) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const IDS = { owner: ID(1), support: ID(2), billing: ID(3), editor: ID(4), revoked: ID(5), cust: UID, cust2: ID(40), camp: ID(60), campDraft: ID(61), campPaused: ID(62), ticket: ID(70), refund: ID(90) };
const day = (n) => new Date(Date.now() + n * 864e5).toISOString();
export async function seed(extra = {}) {
  const staff = [
    { user_id: IDS.owner, email: "owner@example.com", role: "owner", extra_grants: [], state: "active", version: 1, created_at: day(-60) },
    { user_id: IDS.support, email: "support@example.com", role: "support", extra_grants: [], state: "active", version: 1, created_at: day(-40) },
    { user_id: IDS.billing, email: "billing@example.com", role: "billing", extra_grants: ["billing.refund_request"], state: "active", version: 1, created_at: day(-30) },
    { user_id: IDS.editor, email: "editor@example.com", role: "content_editor", extra_grants: [], state: "active", version: 1, created_at: day(-20) },
    { user_id: IDS.revoked, email: "former@example.com", role: "support", extra_grants: [], state: "revoked", version: 2, created_at: day(-90) },
  ];
  const users = {
    [IDS.cust]: { id: IDS.cust, email: "tester@example.com", created_at: day(-45), last_sign_in_at: day(-1), email_confirmed_at: day(-45), app_metadata: {}, user_metadata: {} },
    [IDS.cust2]: { id: IDS.cust2, email: "second@example.com", created_at: day(-10), last_sign_in_at: day(-2), email_confirmed_at: day(-10), app_metadata: {}, user_metadata: {} },
  };
  const campBase = { internal_reason: "Launch offer", plans: ["pro", "business"], audience: "new_paid", delivery: "public", code_hash: null, banner_text: "Launch offer: 20% off your first payment", display_tz: "Africa/Lagos", total_limit: 100, per_customer_limit: 1, priority: 0, version: 1, created_at: day(-5), updated_at: day(-2) };
  const tables = {
    staff_members: staff,
    staff_invites: [
      { id: ID(80), email: "new.support@example.com", role: "support", extra_grants: [], expires_at: day(5), accepted_at: null, revoked_at: null, created_at: day(-1) },
      { id: ID(81), email: "late@example.com", role: "billing", extra_grants: [], expires_at: day(-2), accepted_at: null, revoked_at: null, created_at: day(-9) },
      { id: ID(82), email: "cancelled@example.com", role: "content_editor", extra_grants: [], expires_at: day(3), accepted_at: null, revoked_at: day(-1), created_at: day(-4) },
    ],
    customer_profiles: [{ user_id: IDS.cust, display_name: "Test Customer", contact_email: "tester@example.com", status: "active", status_reason: null, version: 1, updated_at: day(-3) }],
    customer_notes: [{ id: ID(85), user_id: IDS.cust, body: "Asked about invoice wording.", created_at: day(-2) }],
    plan_versions: [
      { id: ID(50), plan: "pro", version: 1, base_kobo: 350000, period_days: 30, display: {}, state: "published", effective_at: day(-30), created_at: day(-30) },
      { id: ID(51), plan: "pro", version: 2, base_kobo: 400000, period_days: 30, display: {}, state: "draft", effective_at: null, created_at: day(-1) },
      { id: ID(52), plan: "business", version: 1, base_kobo: 950000, period_days: 30, display: {}, state: "published", effective_at: day(-30), created_at: day(-30) },
    ],
    campaigns: [
      { ...campBase, id: IDS.camp, slug: "launch-20", name: "Launch 20% off", discount_kind: "percent", basis_points: 2000, fixed_kobo: null, starts_at: day(-2), ends_at: day(12), state: "active" },
      { ...campBase, id: IDS.campDraft, slug: "welcome-fixed", name: "Welcome ₦500 off", discount_kind: "fixed", basis_points: null, fixed_kobo: 50000, starts_at: day(3), ends_at: day(30), state: "draft", delivery: "private", code_hash: "x" },
      { ...campBase, id: IDS.campPaused, slug: "paused-promo", name: "Paused promo", discount_kind: "percent", basis_points: 1000, fixed_kobo: null, starts_at: day(-9), ends_at: day(20), state: "paused" },
    ],
    campaign_versions: [{ campaign_id: IDS.camp, version: 1, snapshot: {}, published_at: day(-2) }],
    redemptions: [
      { id: ID(95), quote_id: ID(96), campaign_id: IDS.camp, user_id: IDS.cust2, reference: "qrf_demo_1", state: "consumed", reserved_at: day(-1), expires_at: day(0), consumed_at: day(-1) },
      { id: ID(97), quote_id: ID(98), campaign_id: IDS.camp, user_id: IDS.cust, reference: null, state: "reserved", reserved_at: day(0), expires_at: day(0), consumed_at: null },
    ],
    refund_requests: [{ id: IDS.refund, reference: "qrf_demo_1", amount_kobo: 280000, reason: "Customer charged twice", state: "requested", decision_reason: null, created_at: day(-1) }],
    support_tickets: [
      { id: IDS.ticket, customer_id: IDS.cust, subject: "Cannot download SVG", state: "open", priority: "high", assigned_to: IDS.support, version: 1, created_at: day(-2), updated_at: day(-1) },
      { id: ID(71), customer_id: IDS.cust2, subject: "Question about renewal", state: "pending", priority: "normal", assigned_to: null, version: 1, created_at: day(-4), updated_at: day(-3) },
    ],
    ticket_messages: [
      { id: ID(72), ticket_id: IDS.ticket, kind: "customer", body: "The SVG button does nothing on my phone.", created_at: day(-2) },
      { id: ID(73), ticket_id: IDS.ticket, kind: "internal_note", body: "Checking plan; looks like Free.", created_at: day(-1) },
      { id: ID(74), ticket_id: IDS.ticket, kind: "reply_draft", body: "Hello, SVG downloads are part of paid plans.", created_at: day(-1) },
    ],
    audit_events: [
      { id: 12, at: day(-1), actor_id: IDS.owner, actor_email: "owner@example.com", actor_role: "owner", action: "plan.publish", target_type: "plan_version", target_id: ID(50), reason: "Initial prices", before_state: { state: "draft" }, after_state: { state: "published", api_key: "[redacted]" }, correlation_id: "c-12" },
      { id: 11, at: day(-2), actor_id: IDS.support, actor_email: "support@example.com", actor_role: "support", action: "customer.note", target_type: "customer", target_id: IDS.cust, reason: null, before_state: null, after_state: { note: "added" }, correlation_id: "c-11" },
    ],
    content_drafts: [],
    content_revisions: [],
    app_settings: [{ key: "support_email", value: "help@example.com", version: 1, updated_at: day(-3) }],
    ...(extra.tables ?? {}),
  };
  const payments = [
    { id: "p1", reference: "qrf_demo_1", user_id: IDS.cust2, plan: "pro", amount_kobo: 280000, base_kobo: 350000, discount_kobo: 70000, status: "success", campaign_id: IDS.camp, created_at: day(-1) },
    { id: "p2", reference: "qrf_demo_2", user_id: IDS.cust, plan: "business", amount_kobo: 950000, base_kobo: 950000, discount_kobo: 0, status: "failed", created_at: day(-3) },
  ];
  const customers = [
    { user_id: IDS.cust, email: "tester@example.com", created_at: day(-45), last_sign_in_at: day(-1), plan: "business", current_period_end: day(20), auto_renew: true, status: "active", total: 2 },
    { user_id: IDS.cust2, email: "second@example.com", created_at: day(-10), last_sign_in_at: day(-2), plan: "pro", current_period_end: day(28), auto_renew: false, status: "active", total: 2 },
  ];
  const stats = { customers_total: 2, customers_new: 1, paid_accounts_active: 2, saved_codes_total: 9, tickets_open: 2, payments_confirmed: 1, gross_kobo: 280000, discount_kobo: 70000, redemptions_consumed: 1, refund_requests_open: 1, refunds_executed_kobo: 0, drafts_unpublished: 0 };
  await ctl({
    reset: true, users, tables,
    push: { payments, subscriptions: [{ user_id: IDS.cust, plan: "business", current_period_end: day(20), auto_renew: true, authorization_code: null, renewal_kobo: 950000 }] },
    rpc: { stats_summary: stats, payments_by_day: [{ day: new Date().toISOString().slice(0, 10), payments: 1, gross_kobo: 280000, discount_kobo: 70000 }], list_customers: customers, ...(extra.rpc ?? {}) },
  });
}
