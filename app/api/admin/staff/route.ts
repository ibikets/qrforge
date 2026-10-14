import { createHash, randomBytes } from "node:crypto";
import { adminActions, fail } from "@/lib/admin/guard";
import { EXTRA_GRANTS, ROLES, type Role } from "@/lib/admin/permissions";
import { email, int, must, oneOf, stringList, uuid } from "@/lib/admin/validate";
import { adm as supabaseAdmin } from "@/lib/admin/db";

const INVITE_TTL_MS = 3 * 24 * 3600_000;

export const POST = adminActions({
  /** Invitations are bound to one email and a role chosen by the Owner; the one-time link is shown only to the Owner who made it. */
  invite: {
    cap: "staff.manage",
    limit: 20,
    async handler({ staff, body, req }) {
      const to = email(body, "email");
      const role = oneOf(body, "role_choice", ROLES, "Role") as Role;
      const grants = stringList(body, "grants", EXTRA_GRANTS);
      if (role === "owner" && grants.length) throw fail(422, "Owners already have every permission.", "grants");
      const token = randomBytes(32).toString("base64url");
      const hash = createHash("sha256").update(token).digest("hex");
      const db = supabaseAdmin();
      must(await db.from("staff_invites").insert({ email: to, role, extra_grants: grants, token_hash: hash, invited_by: staff.userId, expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString() }).select("id").single());
      const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
      return { status: 201, data: { link: `${origin}/staff-invite?token=${token}`, expires_in_hours: INVITE_TTL_MS / 3600_000 }, audit: { action: "staff.invite", targetType: "invite", targetId: to, after: { email: to, role, grants } } };
    },
  },
  revoke_invite: {
    cap: "staff.manage",
    async handler({ body }) {
      const id = uuid(body, "id");
      const row = must(await supabaseAdmin().from("staff_invites").update({ revoked_at: new Date().toISOString() }).eq("id", id).is("accepted_at", null).is("revoked_at", null).select("id,email").maybeSingle());
      if (!row) throw fail(409, "That invitation is no longer pending.");
      return { audit: { action: "staff.invite_revoked", targetType: "invite", targetId: id, after: { email: row.email } } };
    },
  },
  /** No self-service: nobody changes their own role or access, so a compromised session cannot widen itself. */
  change_role: {
    cap: "staff.manage",
    async handler({ staff, body }) {
      const target = uuid(body, "user_id");
      if (target === staff.userId) throw fail(403, "You cannot change your own role. Ask another Owner.");
      const role = oneOf(body, "role_choice", ROLES, "Role") as Role;
      const grants = stringList(body, "grants", EXTRA_GRANTS);
      if (role === "owner" && grants.length) throw fail(422, "Owners already have every permission.", "grants");
      const expected = int(body, "version", { min: 1, max: 1_000_000 })!;
      const db = supabaseAdmin();
      const before = must(await db.from("staff_members").select("role,extra_grants,state,version").eq("user_id", target).maybeSingle());
      if (!before) throw fail(404, "That staff member was not found.");
      const row = must(await db.from("staff_members").update({ role, extra_grants: grants, version: expected + 1, updated_at: new Date().toISOString() }).eq("user_id", target).eq("version", expected).select("version").maybeSingle());
      if (!row) throw fail(409, "This was changed by someone else since you opened it. Reload to see the latest version.");
      return { audit: { action: "staff.role_changed", targetType: "staff", targetId: target, before: { role: before.role, grants: before.extra_grants }, after: { role, grants } } };
    },
  },
  revoke: {
    cap: "staff.manage",
    async handler({ staff, body }) {
      const target = uuid(body, "user_id");
      if (target === staff.userId) throw fail(403, "You cannot revoke your own access.");
      const expected = int(body, "version", { min: 1, max: 1_000_000 })!;
      const row = must(await supabaseAdmin().from("staff_members").update({ state: "revoked", version: expected + 1, updated_at: new Date().toISOString() }).eq("user_id", target).eq("version", expected).select("email").maybeSingle());
      if (!row) throw fail(409, "This was changed by someone else since you opened it. Reload to see the latest version.");
      return { audit: { action: "staff.revoked", targetType: "staff", targetId: target, after: { email: row.email } } };
    },
  },
  restore: {
    cap: "staff.manage",
    async handler({ staff, body }) {
      const target = uuid(body, "user_id");
      if (target === staff.userId) throw fail(403, "You cannot change your own access.");
      const expected = int(body, "version", { min: 1, max: 1_000_000 })!;
      const row = must(await supabaseAdmin().from("staff_members").update({ state: "active", version: expected + 1, updated_at: new Date().toISOString() }).eq("user_id", target).eq("version", expected).eq("state", "revoked").select("email").maybeSingle());
      if (!row) throw fail(409, "This was changed by someone else since you opened it. Reload to see the latest version.");
      return { audit: { action: "staff.restored", targetType: "staff", targetId: target, after: { email: row.email } } };
    },
  },
});
