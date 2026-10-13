import { PLANS, PAID_PLANS, type PlanId } from "./plans";
import { supabaseAdmin } from "./supabase";

const API = "https://api.paystack.co";
const PERIOD_DAYS = 30;
const MAX_FAILURES = 3;

export const paystackHeaders = () => ({
  Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
  "Content-Type": "application/json",
});

/**
 * Verify a transaction directly with Paystack and, if it is a genuine successful payment for the
 * right amount, grant/extend the plan. Safe to call from both the webhook and the return page:
 * the payments.reference primary key guarantees a payment is applied exactly once.
 */
export type Activation = {
  ok: boolean;
  /** confirmed: plan applied (now or earlier). pending: Paystack/our database not final yet, do not pay again. failed: Paystack says it did not succeed. */
  state: "confirmed" | "pending" | "failed";
  plan?: PlanId;
  userId?: string;
  /** actual paid-until timestamp read back from the subscription row */
  periodEnd?: string;
  /** true when a retry could succeed (network/database error): webhooks should answer non-2xx */
  transient?: boolean;
};

const PENDING_STATES = new Set(["pending", "ongoing", "processing", "queued"]);

export async function activateFromReference(reference: string): Promise<Activation> {
  let json;
  try {
    const res = await fetch(`${API}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: paystackHeaders(),
      cache: "no-store",
    });
    json = await res.json();
    if (!res.ok || !json.status) {
      // Paystack unknown reference is a definite failure; anything else we cannot tell yet
      return res.status === 404 ? { ok: false, state: "failed" } : { ok: false, state: "pending", transient: true };
    }
  } catch {
    return { ok: false, state: "pending", transient: true };
  }
  const tx = json?.data;
  if (PENDING_STATES.has(tx?.status)) return { ok: false, state: "pending" };
  if (tx?.status !== "success") return { ok: false, state: "failed" };

  const userId: string | undefined = tx.metadata?.user_id;
  const plan = tx.metadata?.plan as PlanId | undefined;
  if (!userId || !plan || !PAID_PLANS.includes(plan)) return { ok: false, state: "failed" };
  // never trust metadata alone: the amount paid must match the plan price
  if (tx.amount !== PLANS[plan].priceNgn * 100 || tx.currency !== "NGN") return { ok: false, state: "failed" };

  const db = supabaseAdmin();
  const periodEnd = async () => {
    const { data } = await db.from("subscriptions").select("current_period_end").eq("user_id", userId).maybeSingle();
    return data?.current_period_end as string | undefined;
  };

  try {
    // Claim the reference first. A concurrent call loses here (duplicate key) and does nothing.
    const { error: claimErr } = await db.from("payments").insert({
      reference,
      user_id: userId,
      plan,
      amount_kobo: tx.amount,
      status: "success",
    });
    if (claimErr) {
      if (claimErr.code === "23505") return { ok: true, state: "confirmed", plan, userId, periodEnd: await periodEnd() };
      return { ok: false, state: "pending", transient: true };
    }

    const { data: current } = await db
      .from("subscriptions")
      .select("current_period_end")
      .eq("user_id", userId)
      .maybeSingle();
    const base =
      current && new Date(current.current_period_end) > new Date() ? new Date(current.current_period_end) : new Date();
    base.setDate(base.getDate() + PERIOD_DAYS);

    const row: Record<string, unknown> = {
      user_id: userId,
      plan,
      current_period_end: base.toISOString(),
      paystack_reference: reference,
      failed_attempts: 0,
      updated_at: new Date().toISOString(),
    };
    const auth = tx.authorization;
    if (auth?.reusable && auth?.authorization_code) {
      row.authorization_code = auth.authorization_code;
      row.customer_email = tx.customer?.email;
    }
    // The renewal preference is only set by a person paying, never by an automatic renewal charge.
    if (!tx.metadata?.renewal && typeof tx.metadata?.auto_renew === "boolean") row.auto_renew = tx.metadata.auto_renew;

    const { error } = await db.from("subscriptions").upsert(row);
    if (error) {
      await db.from("payments").delete().eq("reference", reference); // let a retry apply it
      return { ok: false, state: "pending", transient: true };
    }
    return { ok: true, state: "confirmed", plan, userId, periodEnd: base.toISOString() };
  } catch {
    return { ok: false, state: "pending", transient: true };
  }
}

/** Charge saved cards for subscriptions that expire within 24h. Called daily by the cron route. */
export async function renewDueSubscriptions() {
  const db = supabaseAdmin();
  const now = Date.now();
  const horizon = new Date(now + 24 * 3600_000).toISOString();
  const { data: due, error } = await db
    .from("subscriptions")
    .select("user_id, plan, current_period_end, authorization_code, customer_email, failed_attempts")
    .eq("auto_renew", true)
    .not("authorization_code", "is", null)
    .lte("current_period_end", horizon)
    .lt("failed_attempts", MAX_FAILURES)
    .limit(100);
  if (error) throw new Error(error.message);

  const summary = { checked: due?.length ?? 0, renewed: 0, failed: 0, pending: 0, lapsed: 0 };

  for (const sub of due ?? []) {
    const plan = sub.plan as PlanId;
    // long-lapsed subscriptions are not silently revived
    if (new Date(sub.current_period_end).getTime() < now - 7 * 24 * 3600_000) {
      await db.from("subscriptions").update({ auto_renew: false }).eq("user_id", sub.user_id);
      summary.lapsed++;
      continue;
    }

    const day = sub.current_period_end.slice(0, 10).replace(/-/g, "");
    const reference = `qrf_rn_${String(sub.user_id).replace(/-/g, "").slice(0, 12)}_${day}_${sub.failed_attempts}`;

    const res = await fetch(`${API}/transaction/charge_authorization`, {
      method: "POST",
      headers: paystackHeaders(),
      body: JSON.stringify({
        authorization_code: sub.authorization_code,
        email: sub.customer_email,
        amount: PLANS[plan].priceNgn * 100,
        currency: "NGN",
        reference,
        metadata: { user_id: sub.user_id, plan, renewal: true },
      }),
    });
    const json = await res.json().catch(() => ({}));
    const status: string | undefined = json?.data?.status;

    if (json?.status && status === "success") {
      const r = await activateFromReference(reference);
      r.ok ? summary.renewed++ : summary.failed++;
    } else if (json?.status && status && status !== "failed") {
      summary.pending++; // e.g. awaiting OTP/3DS; the charge.success webhook will activate it
    } else {
      const attempts = (sub.failed_attempts ?? 0) + 1;
      await db
        .from("subscriptions")
        .update({
          failed_attempts: attempts,
          last_attempt_at: new Date().toISOString(),
          ...(attempts >= MAX_FAILURES ? { auto_renew: false } : {}),
        })
        .eq("user_id", sub.user_id);
      summary.failed++;
    }
  }
  return summary;
}
