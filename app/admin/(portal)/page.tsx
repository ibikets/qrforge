import Link from "next/link";
import { Badge, DataTable, Denied, Empty, KV, LoadError, PageHead, Panel, Td, kobo, lagos, linkCls } from "@/components/admin/kit";
import { currentStaff } from "@/lib/admin/guard";
import { adm, load, need, q } from "@/lib/admin/read";

export default async function Overview() {
  const s = await currentStaff();
  if (s.status !== "ok" || !s.staff.caps.has("overview.view")) return <Denied />;
  const { caps, userId } = s.staff;
  const asOf = new Date();
  const from = new Date(asOf.getTime() - 30 * 24 * 3600_000).toISOString();
  const stats = await load(async () => need(q(await adm().rpc("stats_summary", { p_from: from, p_to: asOf.toISOString() }))) as Record<string, number>);
  const audit = await load(async () => {
    let query = adm().from("audit_events").select("id,at,actor_email,action,target_type,target_id").order("id", { ascending: false }).limit(8);
    if (!caps.has("audit.read_all")) query = query.eq("actor_id", userId);
    return q(await query) as { id: number; at: string; actor_email: string | null; action: string; target_type: string | null; target_id: string | null }[];
  });

  const st = stats.ok ? stats.data : null;
  const work: [string, number, string][] = [];
  if (st) {
    if (caps.has("refund.decide") || caps.has("refund.request")) work.push(["Refund requests waiting", st.refund_requests_open, "/admin/payments"]);
    if (caps.has("support.manage")) work.push(["Open support tickets", st.tickets_open, "/admin/support"]);
    if (caps.has("content.draft")) work.push(["Landing drafts not published", st.drafts_unpublished, "/admin/content"]);
  }

  return (
    <>
      <PageHead title="Overview" lead={`Verified from the database at ${lagos(asOf.toISOString())}. Counts cover the last 30 days unless stated.`} />
      {!stats.ok ? <LoadError what="the summary" /> : null}
      {st && work.length ? (
        <Panel title="Needs attention">
          <ul className="grid list-none gap-3 p-0 sm:grid-cols-3">
            {work.map(([label, n, href]) => (
              <li key={label} className="rounded-control border border-divider p-4">
                <p className="text-[13px] text-muted">{label}</p>
                <p className="text-[28px] font-semibold">{n}</p>
                <Link href={href} className={linkCls}>Open</Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      {st && (caps.has("customers.read") || caps.has("customers.read_minimal")) ? (
        <Panel title="Customers">
          <KV items={[["All accounts", st.customers_total], ["New in 30 days", st.customers_new], ["Paid accounts active now", st.paid_accounts_active]]} />
        </Panel>
      ) : null}
      {st && caps.has("stats.financial") ? (
        <Panel title="Payments" aside={<Badge>Confirmed payments only</Badge>}>
          <KV items={[["Payments confirmed", st.payments_confirmed], ["Amount collected", kobo(st.gross_kobo)], ["Discounts given", kobo(st.discount_kobo)], ["Refunds executed", kobo(st.refunds_executed_kobo)]]} />
          <p className="mt-3 text-[13px] text-muted">Collected amount is what customers paid. It is not profit: provider fees and refunds are not netted off.</p>
        </Panel>
      ) : null}
      <Panel title={caps.has("audit.read_all") ? "Recent activity" : "Your recent activity"}>
        {!audit.ok ? (
          <LoadError what="recent activity" />
        ) : audit.data.length === 0 ? (
          <Empty title="No activity yet">Actions taken in management appear here.</Empty>
        ) : (
          <DataTable label="Recent activity" head={["When", "Who", "Action", "Target"]}>
            {audit.data.map((e) => (
              <tr key={e.id}>
                <Td>{lagos(e.at)}</Td>
                <Td>{e.actor_email ?? "System"}</Td>
                <Td><Link href={`/admin/audit/${e.id}`} className={linkCls}>{e.action}</Link></Td>
                <Td>{e.target_type ? `${e.target_type}${e.target_id ? ` · ${e.target_id.slice(0, 8)}` : ""}` : "–"}</Td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>
    </>
  );
}
