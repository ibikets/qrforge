import Link from "next/link";
import { notFound } from "next/navigation";
import { Blocked, Denied, Empty, KV, LoadError, PageHead, Panel, lagos, linkCls } from "@/components/admin/kit";
import { EditorForm } from "@/components/admin/Mutation";
import { currentStaff } from "@/lib/admin/guard";
import { adm, load, q } from "@/lib/admin/read";

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
      db.from("ticket_messages").select("id,kind,body,created_at").eq("ticket_id", id).order("created_at"),
      db.from("staff_members").select("user_id,email").eq("state", "active"),
      t.customer_id ? db.auth.admin.getUserById(t.customer_id) : Promise.resolve(null),
    ]);
    return { t, msgs: q(msgs) as { id: string; kind: string; body: string; created_at: string }[], staff: q(staff) as { user_id: string; email: string }[], customerEmail: cust?.data?.user?.email ?? null };
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
                <p className="mb-1 text-[13px] font-medium text-muted">{m.kind === "internal_note" ? "Internal note: the customer never sees this" : m.kind === "reply_draft" ? "Reply draft: not sent" : "Customer"} · {lagos(m.created_at)}</p>
                <p className="whitespace-pre-wrap">{m.body}</p>
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
        <div className="mt-5">
          <Blocked title="Send reply" dependency="A verified sending address and delivery status from an email service. Review the recipient (shown above) and the public/internal difference before this is switched on." />
        </div>
      </Panel>
    </>
  );
}
