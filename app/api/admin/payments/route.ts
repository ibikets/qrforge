import { adm } from "@/lib/admin/db";
import { adminActions, fail } from "@/lib/admin/guard";
import { must, oneOf, str, uuid } from "@/lib/admin/validate";
import { PAYSTACK_API, paystackHeaders } from "@/lib/paystack";

export const POST = adminActions({
  /** Read-only: asks the provider for the transaction and compares it with our record. Changes nothing. */
  reconcile: {
    cap: "payments.read",
    reason: false,
    limit: 20,
    async handler({ body }) {
      const reference = str(body, "reference", { max: 120 });
      const rec = must(await adm().from("payments").select("reference,amount_kobo,status,plan,user_id").eq("reference", reference).maybeSingle());
      if (!rec) throw fail(404, "No payment with that reference.");
      let provider: { status: string; amount: number; currency: string } | null = null;
      try {
        const res = await fetch(`${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`, { headers: paystackHeaders(), cache: "no-store" });
        const j = await res.json();
        if (res.ok && j?.status) provider = { status: String(j.data?.status), amount: Number(j.data?.amount), currency: String(j.data?.currency) };
      } catch {
        /* reported below as unreachable */
      }
      if (!provider) return { data: { checked: false, message: "The payment provider could not be reached. Nothing was changed." } };
      const matches = provider.status === "success" && provider.amount === rec.amount_kobo && provider.currency === "NGN" && rec.status === "success";
      return { data: { checked: true, provider, recorded: { amount_kobo: rec.amount_kobo, status: rec.status }, matches } };
    },
  },
  refund_request: {
    cap: "refund.request",
    limit: 20,
    async handler({ staff, body }) {
      const reference = str(body, "reference", { max: 120 });
      const naira = Number(body.amount_naira);
      if (!Number.isFinite(naira) || naira <= 0) throw fail(422, "Enter an amount greater than zero.", "amount_naira");
      const kobo = Math.round(naira * 100);
      const why = str(body, "reason", { min: 5, max: 500 });
      const key = str(body, "idempotency_key", { min: 8, max: 80 });
      const db = adm();
      const pay = must(await db.from("payments").select("amount_kobo,status").eq("reference", reference).maybeSingle());
      if (!pay || pay.status !== "success") throw fail(404, "Only a confirmed payment can be refunded.", "reference");
      const prior = must(await db.from("refund_requests").select("amount_kobo,state,idempotency_key").eq("reference", reference).in("state", ["requested", "approved", "executed"]));
      const replay = (prior as { idempotency_key: string }[]).some((p) => p.idempotency_key === key);
      if (replay) return { data: { replayed: true } };
      const used = (prior as { amount_kobo: number }[]).reduce((a, p) => a + p.amount_kobo, 0);
      const remaining = pay.amount_kobo - used;
      if (kobo > remaining) throw fail(422, `That is more than the remaining refundable amount (₦${(remaining / 100).toLocaleString("en-US")}).`, "amount_naira");
      const r = must(await db.from("refund_requests").insert({ reference, amount_kobo: kobo, reason: why, requested_by: staff.userId, idempotency_key: key }).select("id").single());
      return { status: 201, data: { id: r.id }, audit: { action: "refund.requested", targetType: "payment", targetId: reference, after: { amount_kobo: kobo } } };
    },
  },
  /** Records the decision only. Moving money is a separate, currently blocked step; an approval is never reported as a refund. */
  refund_decide: {
    cap: "refund.decide",
    limit: 20,
    async handler({ staff, body }) {
      const id = uuid(body, "id");
      const decision = oneOf(body, "decision", ["approved", "declined"] as const, "Decision");
      const why = str(body, "reason", { min: 5, max: 500 });
      const r = must(await adm().from("refund_requests").update({ state: decision, decided_by: staff.userId, decision_reason: why, decided_at: new Date().toISOString() }).eq("id", id).eq("state", "requested").select("reference,amount_kobo").maybeSingle());
      if (!r) throw fail(409, "This request was already decided.");
      return { audit: { action: `refund.${decision}`, targetType: "payment", targetId: r.reference, after: { amount_kobo: r.amount_kobo } } };
    },
  },
  refund_execute: {
    cap: "refund.decide",
    async handler() {
      throw fail(424, "Sending money back is not enabled. It needs the Owner to authorise a live refund path with the payment provider.");
    },
  },
});
