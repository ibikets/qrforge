import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { Badge, Blocked, DataTable, Denied, Empty, KV, LoadError, PageHead, Panel, Td, kobo, lagos, linkCls } from "@/components/admin/kit";
import { ActionButton, EditorForm } from "@/components/admin/Mutation";
import ReconcileButton from "@/components/admin/ReconcileButton";
import { currentStaff } from "@/lib/admin/guard";
import { adm, load, q } from "@/lib/admin/read";

type R = { id: string; amount_kobo: number; reason: string; state: string; created_at: string; decision_reason: string | null };

export default async function PaymentDetail({ params }: { params: Promise<{ reference: string }> }) {
  const s = await currentStaff();
  if (s.status !== "ok" || !s.staff.caps.has("payments.read")) return <Denied />;
  const { caps } = s.staff;
  const { reference: raw } = await params;
  const reference = decodeURIComponent(raw).slice(0, 120);
  const d = await load(async () => {
    const db = adm();
    const p = q(await db.from("payments").select("*").eq("reference", reference).maybeSingle());
    if (!p) return null;
    const [events, refunds, campaign, user] = await Promise.all([
      db.from("payment_events").select("id,at,source,event,outcome").eq("reference", reference).order("id", { ascending: false }).limit(30),
      db.from("refund_requests").select("id,amount_kobo,reason,state,created_at,decision_reason").eq("reference", reference).order("created_at", { ascending: false }),
      p.campaign_id ? db.from("campaigns").select("name,slug").eq("id", p.campaign_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      db.auth.admin.getUserById(p.user_id),
    ]);
    return { p, events: (events.error ? null : events.data) as { id: number; at: string; source: string; event: string | null; outcome: string }[] | null, refunds: q(refunds) as R[], campaign: q(campaign) as { name: string; slug: string } | null, email: user.data?.user?.email ?? null };
  });
  if (!d.ok) return (<><PageHead title="Payment" /><LoadError what="this payment" /></>);
  if (!d.data) notFound();
  const { p, events, refunds, campaign, email } = d.data;
  const reserved = refunds.filter((r) => ["requested", "approved", "executed"].includes(r.state)).reduce((a, r) => a + r.amount_kobo, 0);
  const remaining = p.amount_kobo - reserved;

  return (
    <>
      <PageHead title="Payment" lead={reference} actions={<Link href="/admin/payments" className={linkCls}>All payments</Link>} />
      <Panel title="Record" aside={<Badge tone={p.status === "success" ? "good" : "warn"}>{p.status === "success" ? "Confirmed" : p.status}</Badge>}>
        <KV items={[
          ["Date", lagos(p.created_at)],
          ["Customer", caps.has("customers.read") || caps.has("customers.read_minimal") ? <Link key="c" href={`/admin/customers/${p.user_id}`} className={linkCls}>{email ?? "Unknown"}</Link> : (email ?? "Unknown")],
          ["Plan", p.plan],
          ["Normal price", kobo(p.base_kobo ?? p.amount_kobo)],
          ["Discount", p.discount_kobo ? `${kobo(p.discount_kobo)}${campaign ? ` (${campaign.name}${p.campaign_version ? `, version ${p.campaign_version}` : ""})` : ""}` : "None"],
          ["Paid", kobo(p.amount_kobo)],
          ["Quote", p.quote_id ?? "No quote: paid before offers existed, or a renewal"],
        ]} />
      </Panel>
      <Panel title="Reconcile">
        <ReconcileButton reference={reference} />
        <h3 className="mb-2 mt-6 font-medium">Callback and webhook history</h3>
        {events === null ? <LoadError what="the delivery history" /> : events.length === 0 ? (
          <Empty title="No deliveries recorded yet">Events are recorded from now on. Earlier payments have no history. The payment provider’s own record is checked with Reconcile above.</Empty>
        ) : (
          <DataTable label="Provider deliveries" head={["Received", "Source", "Event", "Result"]}>
            {events.map((e) => (
              <tr key={e.id}>
                <Td>{lagos(e.at)}</Td>
                <Td>{e.source === "webhook" ? "Webhook (signature checked)" : "Customer return page"}</Td>
                <Td>{e.event ?? "–"}</Td>
                <Td>{({ confirmed: "Confirmed", pending: "Still pending", failed: "Not successful", retry_requested: "Asked the provider to retry", ignored: "Not a payment event we act on" } as Record<string, string>)[e.outcome] ?? e.outcome}</Td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>
      <Panel title="Refunds" aside={<span className="text-sm text-muted">Still refundable: {kobo(remaining)}{reserved > 0 ? ` (${kobo(reserved)} already requested or refunded)` : ""}</span>}>
        <p className="mb-4 text-sm text-muted">Review the payment and remaining refundable amount. Entitlement changes are separate.</p>
        {refunds.length === 0 ? <Empty title="No refund requests" /> : (
          <DataTable label="Refund requests" head={["Requested", "Amount", "Reason", "State", ""]}>
            {refunds.map((r) => (
              <tr key={r.id}>
                <Td>{lagos(r.created_at)}</Td>
                <Td>{kobo(r.amount_kobo)}</Td>
                <Td>{r.reason}{r.decision_reason ? <span className="block text-[13px] text-muted">Decision: {r.decision_reason}</span> : null}</Td>
                <Td><Badge tone={r.state === "approved" ? "warn" : r.state === "declined" ? "neutral" : r.state === "executed" ? "good" : "warn"}>{r.state === "requested" ? "Waiting for the Owner" : r.state === "approved" ? "Approved, money not sent" : r.state === "declined" ? "Declined" : r.state}</Badge></Td>
                <Td>
                  {r.state === "requested" && caps.has("refund.decide") ? (
                    <div className="flex flex-wrap gap-2">
                      <ActionButton endpoint="/api/admin/payments" payload={{ action: "refund_decide", id: r.id, decision: "approved" }} label="Approve" variant="primary" confirmLabel="Approve" title={`Approve a ${kobo(r.amount_kobo)} refund?`} effect="This records the decision only. No money is sent from here yet." />
                      <ActionButton endpoint="/api/admin/payments" payload={{ action: "refund_decide", id: r.id, decision: "declined" }} label="Decline" variant="ghost" confirmLabel="Decline" title="Decline this refund?" effect="The request is closed. The customer is not contacted from here." />
                    </div>
                  ) : null}
                </Td>
              </tr>
            ))}
          </DataTable>
        )}
        {caps.has("refund.request") && p.status === "success" && remaining > 0 ? (
          <div className="mt-6 border-t border-divider pt-4">
            <h3 className="mb-3 font-medium">Request a refund</h3>
            <EditorForm endpoint="/api/admin/payments" extra={{ action: "refund_request", reference, idempotency_key: randomUUID() }} initial={{ amount_naira: remaining / 100 }}
              fields={[{ name: "amount_naira", label: "Amount (₦)", type: "number", min: 1, required: true, help: `Up to ${kobo(remaining)}.` }]} submitLabel="Request refund" />
          </div>
        ) : null}
        <div className="mt-6">
          <Blocked title="Sending the money back" dependency="The Owner’s authorisation for a live refund path with the payment provider. Approved requests stay recorded as approved and are never shown as refunded." />
        </div>
      </Panel>
    </>
  );
}
