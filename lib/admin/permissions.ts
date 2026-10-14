/**
 * Staff capability model. Roles are presets; extra grants are an allowlist stored in the database (CHECK-constrained),
 * never free-form client input. This file is pure so the matrix can be tested without any service.
 */
export type Role = "owner" | "support" | "billing" | "content_editor";
export type ExtraGrant = "content.publish" | "billing.adjust" | "billing.refund_request" | "plans.draft";

export const ROLES: Role[] = ["owner", "support", "billing", "content_editor"];
export const EXTRA_GRANTS: ExtraGrant[] = ["content.publish", "billing.adjust", "billing.refund_request", "plans.draft"];

export const CAPS = [
  "overview.view",
  "customers.read",
  "customers.read_minimal",
  "customers.update",
  "customers.suspend",
  "customers.reset_link",
  "payments.read",
  "payments.read_summary",
  "entitlement.adjust",
  "refund.request",
  "refund.decide",
  "plans.draft",
  "plans.publish",
  "campaigns.draft",
  "campaigns.publish",
  "content.draft",
  "content.publish",
  "media.manage",
  "support.manage",
  "stats.financial",
  "stats.operational",
  "stats.content",
  "staff.manage",
  "releases.manage",
  "settings.manage",
  "audit.read_all",
  "audit.read_own",
] as const;
export type Cap = (typeof CAPS)[number];

const ROLE_CAPS: Record<Role, readonly Cap[]> = {
  owner: CAPS,
  support: ["overview.view", "customers.read", "customers.update", "customers.suspend", "customers.reset_link", "payments.read_summary", "support.manage", "stats.operational", "audit.read_own"],
  billing: ["overview.view", "customers.read_minimal", "payments.read", "entitlement.adjust", "refund.request", "plans.draft", "campaigns.draft", "stats.financial", "audit.read_own"],
  content_editor: ["overview.view", "content.draft", "media.manage", "stats.content", "audit.read_own"],
};
const GRANT_CAPS: Record<ExtraGrant, readonly Cap[]> = {
  "content.publish": ["content.publish"],
  "billing.adjust": ["entitlement.adjust"],
  "billing.refund_request": ["refund.request"],
  "plans.draft": ["plans.draft", "campaigns.draft"],
};

export function capsFor(role: Role, grants: readonly string[] = []): Set<Cap> {
  const set = new Set<Cap>(ROLE_CAPS[role] ?? []);
  for (const g of grants) for (const c of GRANT_CAPS[g as ExtraGrant] ?? []) set.add(c);
  return set;
}

/** Actions that need a recent sign-in on top of MFA (step-up). */
export const STEP_UP: ReadonlySet<Cap> = new Set<Cap>(["staff.manage", "refund.decide", "releases.manage", "plans.publish", "campaigns.publish", "content.publish", "customers.suspend", "settings.manage"]);
export const STEP_UP_MAX_AGE_MS = 15 * 60 * 1000;

export const ROLE_LABEL: Record<Role, string> = { owner: "Owner", support: "Support", billing: "Billing", content_editor: "Content Editor" };

/** Plain-language names for the permission matrix. */
export const CAP_LABEL: Record<Cap, string> = {
  "overview.view": "See the overview",
  "customers.read": "See customer profiles, notes and history",
  "customers.read_minimal": "See customer email, plan and payments only",
  "customers.update": "Edit customer profiles and add notes",
  "customers.suspend": "Suspend and unsuspend accounts",
  "customers.reset_link": "Send a password-reset email",
  "payments.read": "See payments and references",
  "payments.read_summary": "See payment summaries on a customer",
  "entitlement.adjust": "Add plan days (Billing up to 30; Owner up to 90 and tier changes)",
  "refund.request": "Request a refund",
  "refund.decide": "Approve or decline a refund",
  "plans.draft": "Draft plan prices and offers",
  "plans.publish": "Publish or archive plan prices",
  "campaigns.draft": "Draft discount offers",
  "campaigns.publish": "Publish, pause or archive offers",
  "content.draft": "Edit landing content drafts",
  "content.publish": "Publish landing content",
  "media.manage": "Manage images",
  "support.manage": "Work support tickets",
  "stats.financial": "See financial statistics",
  "stats.operational": "See customer and usage statistics",
  "stats.content": "See content statistics",
  "staff.manage": "Invite, change and revoke staff",
  "releases.manage": "Run maintenance and releases",
  "settings.manage": "Change settings",
  "audit.read_all": "See the whole audit log",
  "audit.read_own": "See their own audit entries",
};
