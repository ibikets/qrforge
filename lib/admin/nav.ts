import type { Cap } from "./permissions";

export type AdminNavItem = { href: string; label: string; any: Cap[] };
export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin", label: "Overview", any: ["overview.view"] },
  { href: "/admin/customers", label: "Customers", any: ["customers.read", "customers.read_minimal"] },
  { href: "/admin/pages", label: "Pages", any: ["pages.read"] },
  { href: "/admin/links", label: "Links", any: ["pages.read"] },
  { href: "/admin/content", label: "Content", any: ["content.draft"] },
  { href: "/admin/plans", label: "Plans", any: ["plans.draft", "plans.publish", "entitlement.adjust"] },
  { href: "/admin/discounts", label: "Discounts", any: ["campaigns.draft", "campaigns.publish"] },
  { href: "/admin/payments", label: "Payments", any: ["payments.read", "payments.read_summary"] },
  { href: "/admin/support", label: "Support", any: ["support.manage"] },
  { href: "/admin/statistics", label: "Statistics", any: ["stats.financial", "stats.operational", "stats.content"] },
  { href: "/admin/releases", label: "Releases", any: ["releases.manage"] },
  { href: "/admin/staff", label: "Staff", any: ["staff.manage"] },
  { href: "/admin/settings", label: "Settings", any: ["settings.manage"] },
  { href: "/admin/audit", label: "Audit", any: ["audit.read_all", "audit.read_own"] },
  { href: "/admin/security", label: "Security", any: ["overview.view"] },
];
export const navFor = (caps: ReadonlySet<Cap>) => ADMIN_NAV.filter((i) => i.any.some((c) => caps.has(c)));
