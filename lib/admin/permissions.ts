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
