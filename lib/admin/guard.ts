import { connection } from "next/server";
import { forbidden, rateLimit, readJson, sameOrigin } from "@/lib/request-guards";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase";
import { claimsOf, hasPasswordLogin, lastAuthAt } from "@/lib/staff-auth";
import { staffServer } from "@/lib/staff-server";
import { capsFor, STEP_UP, STEP_UP_MAX_AGE_MS, type Cap, type Role } from "./permissions";
import { redact, writeAudit, type AuditInput } from "./audit";

export type Staff = {
  userId: string;
  email: string;
  role: Role;
  grants: string[];
  caps: Set<Cap>;
  version: number;
  /** ms epoch of the last password or second-factor sign-in of THIS staff session, used for step-up */
  signedInAt: number;
};

export type StaffState =
  | { status: "ok"; staff: Staff }
  | { status: "anonymous" }
  | { status: "not_staff"; email: string; canBootstrap: boolean }
  | { status: "revoked"; email: string }
  | { status: "needs_mfa"; email: string }
  | { status: "unavailable"; reason: "not_configured" | "migration_pending" | "error" };

/** MFA is required for all staff unless explicitly disabled for a local stand-in run. Production must not set this. */
const mfaRequired = () => process.env.STAFF_MFA_REQUIRED !== "false";

/** Resolve the caller's staff standing from the database on EVERY call (no cached roles, no client-supplied role). */
export async function currentStaff(): Promise<StaffState> {
  await connection();
  if (!supabaseConfigured || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { status: "unavailable", reason: "not_configured" };
  // The STAFF session only. A customer session (password or Google) lives in a different cookie and is never consulted here.
  const sb = await staffServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.email) return { status: "anonymous" };
  const email = user.email.toLowerCase();
  // The access token below was just verified by getUser(); its method claims are therefore trustworthy.
  const {
    data: { session },
  } = await sb.auth.getSession();
  const claims = claimsOf(session?.access_token);
  // Server-side check of HOW this session was established: staff access requires a password sign-in.
  if (!hasPasswordLogin(claims.amr)) return { status: "anonymous" };

  const { data: row, error } = await supabaseAdmin()
    .from("staff_members")
    .select("user_id,email,role,extra_grants,state,version")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    // 42P01 / PGRST205: the table does not exist yet, i.e. the migration has not been applied
    const pending = error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message);
    return { status: "unavailable", reason: pending ? "migration_pending" : "error" };
  }
  if (!row) {
    const owner = (process.env.OWNER_BOOTSTRAP_EMAIL ?? "").trim().toLowerCase();
    const canBootstrap = Boolean(owner) && owner === email && Boolean(user.email_confirmed_at);
    return { status: "not_staff", email, canBootstrap };
  }
  if (row.state !== "active") return { status: "revoked", email };

  if (mfaRequired() && claims.aal !== "aal2") return { status: "needs_mfa", email };

  const grants = (row.extra_grants as string[]) ?? [];
  return {
    status: "ok",
    staff: {
      userId: user.id,
      email,
      role: row.role as Role,
      grants,
      caps: capsFor(row.role as Role, grants),
      version: row.version as number,
      signedInAt: lastAuthAt(claims.amr),
    },
  };
}

const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export type RouteCtx = { staff: Staff; body: Record<string, unknown>; req: Request };
export type RouteResult = { status?: number; data?: Record<string, unknown>; audit?: AuditInput };

export type ActionSpec = { cap: Cap; reason?: boolean; limit?: number; handler: (ctx: RouteCtx) => Promise<RouteResult> };

/**
 * The same gate as adminActions for routes that cannot be JSON (file uploads): same-origin, fresh staff lookup, MFA,
 * capability, step-up and rate limit, in the same order. Returns the staff or the response to send.
 */
export async function authorise(req: Request, cap: Cap, name: string, limit = 30): Promise<{ staff: Staff } | { response: Response }> {
  if (!sameOrigin(req)) return { response: forbidden() };
  const state = await currentStaff();
  if (state.status === "anonymous") return { response: json(401, { error: "Sign in again to continue." }) };
  if (state.status === "unavailable") return { response: json(503, { error: "Management is not available yet.", reason: state.reason }) };
  if (state.status === "not_staff" || state.status === "revoked") return { response: json(403, { error: "Your staff role cannot do this." }) };
  if (state.status === "needs_mfa") return { response: json(403, { error: "Complete multi-factor sign-in first.", code: "mfa_required" }) };
  const { staff } = state;
  const limited = rateLimit(req, `admin:${name}`, limit, 60_000, staff.userId);
  if (limited) return { response: limited };
  if (!staff.caps.has(cap)) return { response: json(403, { error: "Your staff role cannot do this." }) };
  if (STEP_UP.has(cap) && Date.now() - staff.signedInAt > STEP_UP_MAX_AGE_MS) return { response: json(403, { error: "Sign in again to confirm this action.", code: "reauth_required" }) };
  return { staff };
}

/**
 * Every privileged mutation goes through here, so none can skip a check:
 * same-origin, fresh staff lookup, MFA, per-action capability, step-up, bounded JSON, reason, the handler, then the audit record.
 * The capability is chosen by the SERVER from the action name; nothing in the body can select a weaker one.
 * If the audit write fails after a successful change the response says so (the change is never silently unaudited).
 */
export function adminActions(actions: Record<string, ActionSpec>) {
  return async function POST(req: Request): Promise<Response> {
    if (!sameOrigin(req)) return forbidden();
    const state = await currentStaff();
    if (state.status === "anonymous") return json(401, { error: "Sign in again to continue." });
    if (state.status === "unavailable") return json(503, { error: "Management is not available yet.", reason: state.reason });
    if (state.status === "not_staff" || state.status === "revoked") return json(403, { error: "Your staff role cannot do this." });
    if (state.status === "needs_mfa") return json(403, { error: "Complete multi-factor sign-in first.", code: "mfa_required" });
    const { staff } = state;
    const parsed = await readJson(req, 100_000);
    if (!parsed || "tooLarge" in parsed) return json(400, { error: "Invalid request." });
    const body = parsed.body as Record<string, unknown> | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "Invalid request." });
    const name = typeof body.action === "string" ? body.action : "";
    const spec = Object.hasOwn(actions, name) ? actions[name] : undefined;
    if (!spec) return json(400, { error: "Unknown action." });
    const limited = rateLimit(req, `admin:${name}`, spec.limit ?? 60, 60_000, staff.userId);
    if (limited) return limited;
    if (!staff.caps.has(spec.cap)) return json(403, { error: "Your staff role cannot do this." });
    if (STEP_UP.has(spec.cap) && Date.now() - staff.signedInAt > STEP_UP_MAX_AGE_MS)
      return json(403, { error: "Sign in again to confirm this action.", code: "reauth_required" });
    if (spec.reason !== false) {
      const reason = body.reason;
      if (typeof reason !== "string" || reason.trim().length < 5 || reason.length > 500) return json(422, { error: "Give a reason of at least 5 characters.", field: "reason" });
    }

    let result: RouteResult;
    try {
      result = await spec.handler({ staff, body, req });
    } catch (e) {
      const err = e as { status?: number; message?: string; field?: string; code?: string };
      if (err?.status) return json(err.status, { error: err.message ?? "Request failed.", ...(err.field ? { field: err.field } : {}) });
      // Known database guard codes become precise, safe messages.
      const mapped = mapDbError(e);
      if (mapped) return json(mapped.status, { error: mapped.message });
      console.error("admin action failed", name, e);
      return json(500, { error: "Something went wrong. Nothing was confirmed; reload and check before retrying." });
    }
    if (result.audit) {
      const reason = typeof body.reason === "string" ? body.reason : null;
      const ok = await writeAudit(staff, { reason, ...result.audit });
      if (!ok) return json(500, { error: "The change was applied but its audit record could not be saved. Tell the Owner.", code: "audit_failed", ...(result.data ?? {}) });
    }
    return json(result.status ?? 200, { ok: true, ...(result.data ?? {}) });
  };
}

const DB_MESSAGES: Record<string, [number, string]> = {
  QF010: [409, "The last active Owner cannot be removed or demoted."],
  QF012: [409, "A published plan version cannot be changed."],
  QF021: [422, "That offer is not available."],
  QF030: [422, "Extensions are 1 to 90 days."],
  QF031: [422, "This customer has no paid plan to extend."],
  QF032: [422, "Pick an existing paid customer and a paid plan."],
  QF040: [409, "This was changed by someone else since you opened it. Reload to see the latest version."],
};
export function mapDbError(e: unknown): { status: number; message: string } | null {
  const msg = String((e as { message?: string })?.message ?? "");
  const m = /QF\d{3}/.exec(msg);
  if (!m) return null;
  const hit = DB_MESSAGES[m[0]];
  return hit ? { status: hit[0], message: hit[1] } : null;
}

/** Throw from a handler to return a specific 4xx. */
export const fail = (status: number, message: string, field?: string) => Object.assign(new Error(message), { status, field });

/** Page helper: returns the staff or a reason the page should render a denial. */
export async function pageStaff(cap: Cap): Promise<{ ok: true; staff: Staff } | { ok: false }> {
  const s = await currentStaff();
  return s.status === "ok" && s.staff.caps.has(cap) ? { ok: true, staff: s.staff } : { ok: false };
}

export { redact };
