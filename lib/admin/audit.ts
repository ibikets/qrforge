import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import type { Staff } from "./guard";

const SENSITIVE = /pass(word)?|secret|token|authori[sz]ation|code_hash|api[_-]?key|service[_-]?role|^key$|otp/i;

/** Redact BEFORE persisting: sensitive keys are replaced, long strings truncated, depth and size bounded. */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (depth > 4) return "[truncated]";
  if (typeof value === "string") return value.length > 300 ? value.slice(0, 300) + "…" : value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 25).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = SENSITIVE.test(k) ? "[redacted]" : redact(v, depth + 1);
  return out;
}

export type AuditInput = {
  action: string;
  targetType?: string;
  targetId?: string;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
  correlationId?: string;
};

export async function writeAudit(actor: Pick<Staff, "userId" | "email" | "role"> | null, a: AuditInput): Promise<boolean> {
  const { error } = await supabaseAdmin().from("audit_events").insert({
    actor_id: actor?.userId ?? null,
    actor_email: actor?.email ?? null,
    actor_role: actor?.role ?? null,
    action: a.action,
    target_type: a.targetType ?? null,
    target_id: a.targetId ?? null,
    reason: a.reason ?? null,
    before_state: redact(a.before),
    after_state: redact(a.after),
    correlation_id: a.correlationId ?? randomUUID(),
  });
  if (error) console.error("audit write failed", a.action, error.code);
  return !error;
}
