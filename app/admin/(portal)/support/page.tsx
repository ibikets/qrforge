import Link from "next/link";
import { randomUUID } from "node:crypto";
import { Badge, DataTable, Denied, Empty, LoadError, PageHead, Panel, Td, lagos, linkCls } from "@/components/admin/kit";
import { EditorForm } from "@/components/admin/Mutation";
import { currentStaff } from "@/lib/admin/guard";
import { adm, load, one, q } from "@/lib/admin/read";

type T = { id: string; subject: string; state: string; priority: string; created_at: string; updated_at: string; assigned_to: string | null };
const STATES = ["open", "pending", "resolved"];

export default async function Support({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await currentStaff();
  if (s.status !== "ok" || !s.staff.caps.has("support.manage")) return <Denied />;
  const sp = await searchParams;
  const st = STATES.includes(one(sp.state)) ? one(sp.state) : "";
  const rows = await load(async () => {
    let qy = adm().from("support_tickets").select("id,subject,state,priority,created_at,updated_at,assigned_to").order("updated_at", { ascending: false }).limit(100);
    qy = st ? qy.eq("state", st) : qy.neq("state", "resolved");
    return q(await qy) as T[];
  });
  return (
    <>
      <PageHead title="Support" lead="Tickets, internal notes and reply drafts. Replies are not sent from here yet." />
      <nav aria-label="Ticket filter" className="mb-5 flex flex-wrap gap-4 text-sm">
        <Link href="/admin/support" className={linkCls} aria-current={!st ? "page" : undefined}>Open and pending</Link>
        {STATES.map((x) => (<Link key={x} href={`/admin/support?state=${x}`} className={linkCls} aria-current={st === x ? "page" : undefined}>{x[0].toUpperCase() + x.slice(1)}</Link>))}
      </nav>
      <Panel>
        {!rows.ok ? <LoadError what="tickets" /> : rows.data.length === 0 ? (st ? <Empty title="No tickets with this status" /> : <Empty title="No open tickets">Nothing needs attention.</Empty>) : (
          <DataTable label="Tickets" head={["Subject", "Status", "Priority", "Updated"]}>
            {rows.data.map((t) => (
              <tr key={t.id}>
                <Td><Link href={`/admin/support/${t.id}`} className={linkCls}>{t.subject}</Link></Td>
                <Td><Badge tone={t.state === "resolved" ? "good" : t.state === "pending" ? "warn" : "neutral"}>{t.state}</Badge></Td>
                <Td>{t.priority}</Td>
                <Td>{lagos(t.updated_at)}</Td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>
      <Panel title="Log a ticket">
        <p className="mb-4 text-sm text-muted">Record an issue someone raised with you. This does not email anyone.</p>
        <EditorForm endpoint="/api/admin/support" extra={{ action: "create_ticket", nonce: randomUUID() }}
          fields={[
            { name: "subject", label: "Subject", required: true, maxLength: 140 },
            { name: "customer_email", label: "Customer email (optional)", type: "email" },
            { name: "note", label: "Internal note (optional)", type: "textarea", rows: 3, maxLength: 4000 },
          ]} submitLabel="Create ticket" resetOnDone />
      </Panel>
    </>
  );
}
