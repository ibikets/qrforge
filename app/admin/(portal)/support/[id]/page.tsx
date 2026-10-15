import Link from "next/link";
import { notFound } from "next/navigation";
import { Denied, Empty, KV, LoadError, PageHead, Panel, lagos, linkCls } from "@/components/admin/kit";
import { EditorForm } from "@/components/admin/Mutation";
import { currentStaff } from "@/lib/admin/guard";
import { adm, load, q } from "@/lib/admin/read";
import { ActionButton } from "@/components/admin/Mutation";
import { emailEnabled } from "@/lib/email";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Ticket({ params }: { params: Promise<{ id: string }> }) {
  const s = await currentStaff();
  if (s.status !== "ok" || !s.staff.caps.has("support.manage")) return <Denied />;
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const d = await load(async () => {
    const db = adm();
    const t = q(await db.from("support_tickets").select("*").eq("id", id).maybeSingle());
    if (!t) return null;
    const [msgs, staff, cust] = await Promise.all([
      (async () => {
        const full = await db.from("ticket_messages").select("id,kind,body,created_at,delivery,to_email,sent_at,delivery_error").eq("ticket_id", id).order("created_at");
        // Until the email migration is applied the delivery columns do not exist: show the thread without them rather than failing.
        return full.error && (full.error.code === "42703" || /column/i.test(full.error.message)) ? await db.from("ticket_messages").select("id,kind,body,created_at").eq("ticket_id", id).order("created_at") : full;
      })(),
      db.from("staff_members").select("user_id,email").eq("state", "active"),
      t.customer_id ? db.auth.admin.getUserById(t.customer_id) : Promise.resolve(null),
    ]);
    return { t, msgs: q(msgs) as { id: string; kind: string; body: string; created_at: string; delivery?: string | null; to_email?: string | null; sent_at?: string | null; delivery_error?: string | null }[], staff: q(staff) as { user_id: string; email: string }[], customerEmail: cust?.data?.user?.email ?? null };
  });
  if (!d.ok) return (<><PageHead title="Ticket" /><LoadError what="this ticket" /></>);
  if (!d.data) notFound();
  const { t, msgs, staff, customerEmail } = d.data;
  return (
    <>
      <PageHead title={t.subject} actions={<Link href="/admin/support" className={linkCls}>All tickets</Link>} />
      <Panel title="Ticket">
        <KV items={[["Customer", t.customer_id ? <Link key="c" href={`/admin/customers/${t.customer_id}`} className={linkCls}>{customerEmail ?? "Unknown"}</Link> : "Not linked"], ["Opened", lagos(t.created_at)]]} />
        <div className="mt-5">
          <EditorForm endpoint="/api/admin/support" extra={{ action: "update", ticket: id, version: t.version }} initial={{ state: t.state, priority: t.priority, assigned_to: t.assigned_to ?? "" }} reason={false}
            fields={[
              { name: "state", label: "Status", type: "select", options: [{ value: "open", label: "Open" }, { value: "pending", label: "Pending" }, { value: "resolved", label: "Resolved" }] },
              { name: "priority", label: "Priority", type: "select", options: [{ value: "low", label: "Low" }, { value: "normal", label: "Normal" }, { value: "high", label: "High" }] },
              { name: "assigned_to", label: "Assigned to", type: "select", options: [{ value: "", label: "Nobody" }, ...staff.map((m) => ({ value: m.user_id, label: m.email }))] },
            ]} submitLabel="Update ticket" />
        </div>
      </Panel>
      <Panel title="Thread">
        {msgs.length === 0 ? <Empty title="Nothing here yet" /> : (
          <ul className="m-0 grid list-none gap-4 p-0">
            {msgs.map((m) => (
              <li key={m.id} className={`rounded-control border p-4 ${m.kind === "internal_note" ? "border-divider bg-soft" : "border-brand"}`}>
                <p className="mb-1 text-[13px] font-medium text-muted">{m.kind === "internal_note" ? "Internal note: the customer never sees this" : m.kind === "reply_sent" ? `Reply sent by email to ${m.to_email ?? "the customer"}${m.sent_at ? " · " + lagos(m.sent_at) : ""}` : m.kind === "reply_draft" ? (m.delivery === "failed" ? `Reply draft: sending failed (${(m.delivery_error ?? "error").replace(/_/g, " ")}); not sent` : m.delivery === "queued" ? "Reply draft: sending was started but not confirmed" : "Reply draft: not sent") : "Customer"} · {lagos(m.created_at)}</p>
                <p className="whitespace-pre-wrap">{m.body}</p>
                {m.kind === "reply_draft" && customerEmail && s.staff.caps.has("support.manage") ? (
                  <div className="mt-3">
                    <ActionButton endpoint="/api/admin/support" reason={false} payload={{ action: "send_reply", ticket: id, message: m.id, to: customerEmail.toLowerCase() }}
                      label={m.delivery === "failed" || m.delivery === "queued" ? "Retry sending" : "Send to customer"} title="Send this reply by email?" confirmLabel="Send email"
                      disabledReason={emailEnabled() ? undefined : "Email sending is only switched on for the live site"}
                      effect={<><p>This sends the message below to <strong>{customerEmail}</strong> from Qrenuvi Support. The customer will see it. Internal notes are never included.</p><p className="mt-2 whitespace-pre-wrap rounded-control border border-divider p-3 text-ink">{m.body}</p></>} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Add to the thread">
        <EditorForm endpoint="/api/admin/support" extra={{ action: "add_message", ticket: id }} initial={{ kind: "internal_note" }} reason={false} resetOnDone
          fields={[
            { name: "kind", label: "Type", type: "select", options: [{ value: "internal_note", label: "Internal note (staff only)" }, { value: "reply_draft", label: "Reply draft (to the customer, not sent)" }] },
            { name: "message", label: "Message", type: "textarea", rows: 4, maxLength: 4000, required: true },
          ]} submitLabel="Add" />
        <p className="mt-4 text-sm text-muted">Replies are sent only from a saved reply draft, to the customer linked above, after you review the recipient and text. Delivery status appears on the message.</p>
      </Panel>
    </>
  );
}
