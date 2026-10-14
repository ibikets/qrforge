import { connection } from "next/server";
import { forbidden, rateLimit, readJson, sameOrigin } from "@/lib/request-guards";
import { supabaseAdmin, supabaseConfigured, supabaseServer } from "@/lib/supabase";
import { capsFor, STEP_UP, STEP_UP_MAX_AGE_MS, type Cap, type Role } from "./permissions";
import { redact, writeAudit, type AuditInput } from "./audit";

export type Staff = {
  userId: string;
  email: string;
  role: Role;
  grants: string[];
  caps: Set<Cap>;
  version: number;
  /** ms epoch of the last password/OAuth/MFA sign-in, used for step-up */
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

function jwtClaims(token: string | undefined): Record<string, unknown> {
  try {
    return JSON.parse(Buffer.from((token ?? "").split(".")[1] ?? "", "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

/** Resolve the caller's staff standing from the database on EVERY call (no cached roles, no client-supplied role). */
export async function currentStaff(): Promise<StaffState> {
  await connection();
  if (!supabaseConfigured || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { status: "unavailable", reason: "not_configured" };
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.email) return { status: "anonymous" };
  const email = user.email.toLowerCase();

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

  const {
    data: { session },
  } = await sb.auth.getSession();
  const aal = jwtClaims(session?.access_token).aal;
  if (mfaRequired() && aal !== "aal2") return { status: "needs_mfa", email };

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
      signedInAt: user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : 0,
    },
  };
}

const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export type RouteCtx = { staff: Staff; body: Record<string, unknown>; req: Request };
export type RouteResult = { status?: number; data?: Record<string, unknown>; audit?: AuditInput };

/**
 * Every privileged mutation goes through here, so none can skip a check:
 * same-origin, rate limit, fresh staff lookup, MFA, capability, step-up, bounded JSON, then the handler, then the audit record.
 * If the audit write fails after a successful change the response says so (the change is NOT silently unaudited).
 */
export function adminRoute(opts: { cap: Cap; limit?: number; reason?: boolean }, handler: (ctx: RouteCtx) => Promise<RouteResult>) {
  return async function POST(req: Request): Promise<Response> {
    if (!sameOrigin(req)) return forbidden();
    const state = await currentStaff();
    if (state.status === "anonymous") return json(401, { error: "Sign in again to continue." });
    if (state.status === "unavailable") return json(503, { error: "Management is not available yet.", reason: state.reason });
    if (state.status === "not_staff" || state.status === "revoked") return json(403, { error: "Your staff role cannot do this." });
    if (state.status === "needs_mfa") return json(403, { error: "Complete multi-factor sign-in first.", code: "mfa_required" });
    const { staff } = state;
    const limited = rateLimit(req, "admin", opts.limit ?? 60, 60_000, staff.userId);
    if (limited) return limited;
    if (!staff.caps.has(opts.cap)) return json(403, { error: "Your staff role cannot do this." });
    if (STEP_UP.has(opts.cap) && Date.now() - staff.signedInAt > STEP_UP_MAX_AGE_MS)
      return json(403, { error: "Sign in again to confirm this action.", code: "reauth_required" });

    const parsed = await readJson(req, 100_000);
    if (!parsed || "tooLarge" in parsed) return json(400, { error: "Invalid request." });
    const body = parsed.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "Invalid request." });
    if (opts.reason !== false) {
      const reason = (body as Record<string, unknown>).reason;
      if (typeof reason !== "string" || reason.trim().length < 5 || reason.length > 500) return json(422, { error: "Give a reason of at least 5 characters.", field: "reason" });
    }

    let result: RouteResult;
    try {
      result = await handler({ staff, body: body as Record<string, unknown>, req });
    } catch (e) {
      const err = e as { status?: number; message?: string; field?: string };
      if (err?.status) return json(err.status, { error: err.message ?? "Request failed.", ...(err.field ? { field: err.field } : {}) });
      console.error("admin route failed", opts.cap, e);
      return json(500, { error: "Something went wrong. Nothing was confirmed; reload and check before retrying." });
    }
    if (result.audit) {
      const reason = typeof (body as Record<string, unknown>).reason === "string" ? ((body as Record<string, unknown>).reason as string) : null;
      const ok = await writeAudit(staff, { reason, ...result.audit, before: result.audit.before, after: result.audit.after });
      if (!ok) return json(500, { error: "The change was applied but its audit record could not be saved. Tell the Owner.", code: "audit_failed", ...(result.data ?? {}) });
    }
    return json(result.status ?? 200, { ok: true, ...(result.data ?? {}) });
  };
}

/** Throw from a handler to return a specific 4xx. */
export const fail = (status: number, message: string, field?: string) => Object.assign(new Error(message), { status, field });

/** Page helper: returns the staff or a reason the page should render a denial. */
export async function pageStaff(cap: Cap): Promise<{ ok: true; staff: Staff } | { ok: false }> {
  const s = await currentStaff();
  return s.status === "ok" && s.staff.caps.has(cap) ? { ok: true, staff: s.staff } : { ok: false };
}

export { redact };
