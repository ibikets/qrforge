import { adminActions, fail } from "@/lib/admin/guard";
import { email, int, must, oneOf, str, uuid } from "@/lib/admin/validate";
import { adm as supabaseAdmin } from "@/lib/admin/db";

const SUSPEND_FOR = "876000h"; // ~100 years: effectively until lifted

/** The customer must exist, and staff accounts are never managed through the customer tools. */
async function target(body: Record<string, unknown>) {
  const id = uuid(body, "user_id");
  const db = supabaseAdmin();
  const { data, error } = await db.auth.admin.getUserById(id);
  if (error || !data?.user) throw fail(404, "That customer was not found.");
  const isStaff = must(await db.from("staff_members").select("user_id").eq("user_id", id).maybeSingle());
  if (isStaff) throw fail(403, "Staff accounts are managed in Staff, not here.");
  return { id, user: data.user, db };
}

export const POST = adminActions({
  update_profile: {
    cap: "customers.update",
    async handler({ body }) {
      const { id, db } = await target(body);
      const name = str(body, "display_name", { max: 120, optional: true, label: "Display name" });
      const contact = email(body, "contact_email", true);
      const expected = int(body, "version", { min: 0, max: 1_000_000 })!;
      const before = must(await db.from("customer_profiles").select("display_name,contact_email,version").eq("user_id", id).maybeSingle());
      const now = new Date().toISOString();
      if (expected === 0) {
        if (before) throw fail(409, "This was changed by someone else since you opened it. Reload to see the latest version.");
        must(await db.from("customer_profiles").insert({ user_id: id, display_name: name || null, contact_email: contact || null, updated_at: now }).select("version").single());
      } else {
        const row = must(await db.from("customer_profiles").update({ display_name: name || null, contact_email: contact || null, version: expected + 1, updated_at: now }).eq("user_id", id).eq("version", expected).select("version").maybeSingle());
        if (!row) throw fail(409, "This was changed by someone else since you opened it. Reload to see the latest version.");
      }
      return { audit: { action: "customer.profile_updated", targetType: "customer", targetId: id, before: before ?? {}, after: { display_name: name || null, contact_email: contact || null } } };
    },
  },
  suspend: {
    cap: "customers.suspend",
    limit: 20,
    async handler({ staff, body }) {
      const { id, db } = await target(body);
      if (id === staff.userId) throw fail(403, "You cannot suspend your own account.");
      const why = str(body, "reason", { min: 5, max: 500 });
      const { error } = await db.auth.admin.updateUserById(id, { ban_duration: SUSPEND_FOR });
      if (error) throw fail(502, "The sign-in provider did not confirm the suspension. Nothing was changed.");
      const now = new Date().toISOString();
      must(await db.from("customer_profiles").upsert({ user_id: id, status: "suspended", status_reason: why, status_changed_at: now, updated_at: now }, { onConflict: "user_id" }).select("version").single());
      return { audit: { action: "customer.suspended", targetType: "customer", targetId: id, after: { status: "suspended" } } };
    },
  },
  unsuspend: {
    cap: "customers.suspend",
    limit: 20,
    async handler({ body }) {
      const { id, db } = await target(body);
      const { error } = await db.auth.admin.updateUserById(id, { ban_duration: "none" });
      if (error) throw fail(502, "The sign-in provider did not confirm the change. Nothing was changed.");
      const now = new Date().toISOString();
      must(await db.from("customer_profiles").upsert({ user_id: id, status: "active", status_reason: null, status_changed_at: now, updated_at: now }, { onConflict: "user_id" }).select("version").single());
      return { audit: { action: "customer.unsuspended", targetType: "customer", targetId: id, after: { status: "active" } } };
    },
  },
  /** The reset email goes to the customer's own address. Staff never see or handle a reset link. */
  send_reset: {
    cap: "customers.reset_link",
    limit: 10,
    async handler({ body, req }) {
      const { id, user } = await target(body);
      if (!user.email) throw fail(422, "This customer has no sign-in email.");
      const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
      const { error } = await supabaseAdmin().auth.resetPasswordForEmail(user.email, { redirectTo: `${origin}/auth/callback?next=/reset-password` });
      if (error) throw fail(502, "The email provider did not accept the request. Nothing was sent.");
      return { data: { queued: true }, audit: { action: "customer.reset_email_requested", targetType: "customer", targetId: id } };
    },
  },
  add_note: {
    cap: "customers.update",
    reason: false,
    async handler({ staff, body }) {
      const { id, db } = await target(body);
      const note = str(body, "note", { max: 2000, label: "Note" });
      must(await db.from("customer_notes").insert({ user_id: id, body: note, author_id: staff.userId }).select("id").single());
      return { status: 201, audit: { action: "customer.note_added", targetType: "customer", targetId: id } };
    },
  },
  /** Journaled entitlement change; never creates a payment. Billing is capped at 30 days and cannot change plans. */
  adjust_entitlement: {
    cap: "entitlement.adjust",
    limit: 20,
    async handler({ staff, body }) {
      const { id, db } = await target(body);
      const kind = oneOf(body, "kind", ["extend_days", "set_plan"] as const, "Adjustment");
      const why = str(body, "reason", { min: 5, max: 500 });
      let days: number | null = null;
      let plan: string | null = null;
      if (kind === "extend_days") {
        days = int(body, "days", { min: 1, max: 90, label: "Days" })!;
        if (staff.role !== "owner" && days > 30) throw fail(403, "Only an Owner can extend by more than 30 days.", "days");
      } else {
        if (staff.role !== "owner") throw fail(403, "Only an Owner can change a customer’s plan.");
        plan = oneOf(body, "plan", ["pro", "business"] as const, "Plan");
      }
      const res = must(await db.rpc("adjust_entitlement", { p_user: id, p_kind: kind, p_days: days, p_plan: plan, p_reason: why, p_actor: staff.userId }));
      const r = res as { previous: unknown; next: unknown };
      return { data: { result: r }, audit: { action: "entitlement.adjusted", targetType: "customer", targetId: id, before: r.previous, after: r.next } };
    },
  },
});
