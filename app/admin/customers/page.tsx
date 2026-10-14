import Link from "next/link";
import { Badge, DataTable, Denied, Empty, LoadError, PageHead, Panel, Td, lagos, linkCls } from "@/components/admin/kit";
import { currentStaff } from "@/lib/admin/guard";
import { adm, load, one, PAGE_SIZE, pageNum, q } from "@/lib/admin/read";

type Row = { user_id: string; email: string; created_at: string; last_sign_in_at: string | null; plan: string; current_period_end: string | null; auto_renew: boolean | null; status: string; total: number };
const STATUSES = ["", "active", "suspended", "free", "pro", "business"];

export default async function Customers({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await currentStaff();
  if (s.status !== "ok" || !(s.staff.caps.has("customers.read") || s.staff.caps.has("customers.read_minimal"))) return <Denied />;
  const sp = await searchParams;
  const term = one(sp.q).trim().slice(0, 80);
  const status = STATUSES.includes(one(sp.status)) ? one(sp.status) : "";
  const page = pageNum(sp.page);
  const rows = await load(async () => q(await adm().rpc("list_customers", { p_q: term, p_status: status, p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE })) as Row[]);
  const filtered = Boolean(term || status);
  const total = rows.ok && rows.data[0] ? Number(rows.data[0].total) : 0;
  const link = (p: number) => `/admin/customers?${new URLSearchParams({ ...(term ? { q: term } : {}), ...(status ? { status } : {}), page: String(p) })}`;

  return (
    <>
      <PageHead title="Customers" lead="Accounts, plan and status. Passwords, saved payment details and QR contents are never shown." />
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3" role="search" aria-label="Filter customers">
        <div>
          <label htmlFor="cq" className="mb-1 block text-sm font-medium">Email contains</label>
          <input id="cq" name="q" defaultValue={term} maxLength={80} className="min-h-11 rounded-control border border-control-border bg-transparent px-3 text-base" />
        </div>
        <div>
          <label htmlFor="cs" className="mb-1 block text-sm font-medium">Show</label>
          <select id="cs" name="status" defaultValue={status} className="min-h-11 rounded-control border border-control-border bg-surface px-3 text-base">
            <option value="">All customers</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="free">Free plan</option>
            <option value="pro">Pro</option>
            <option value="business">Business</option>
          </select>
        </div>
        <button className="min-h-11 rounded-control border border-brand px-4 font-medium text-brand">Apply</button>
        {filtered ? <Link href="/admin/customers" className={linkCls}>Clear filters</Link> : null}
      </form>
      <Panel>
        {!rows.ok ? (
          <LoadError what="customers" />
        ) : rows.data.length === 0 ? (
          filtered ? <Empty title="No customers match these filters">Try a different email or clear the filters.</Empty> : <Empty title="No customers yet">Accounts appear here when people sign up.</Empty>
        ) : (
          <>
            <DataTable label="Customers" head={["Email", "Plan", "Plan ends", "Status", "Joined"]}>
              {rows.data.map((r) => (
                <tr key={r.user_id}>
                  <Td><Link href={`/admin/customers/${r.user_id}`} className={linkCls}>{r.email}</Link></Td>
                  <Td>{r.plan === "free" ? "Free" : r.plan === "pro" ? "Pro" : "Business"}</Td>
                  <Td>{r.plan === "free" ? "–" : lagos(r.current_period_end)}</Td>
                  <Td><Badge tone={r.status === "suspended" ? "bad" : "good"}>{r.status === "suspended" ? "Suspended" : "Active"}</Badge></Td>
                  <Td>{lagos(r.created_at)}</Td>
                </tr>
              ))}
            </DataTable>
            <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pages">
              <span className="text-muted">Showing {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + rows.data.length} of {total}</span>
              <span className="flex gap-4">
                {page > 1 ? <Link href={link(page - 1)} className={linkCls}>Previous</Link> : null}
                {page * PAGE_SIZE < total ? <Link href={link(page + 1)} className={linkCls}>Next</Link> : null}
              </span>
            </nav>
          </>
        )}
      </Panel>
    </>
  );
}
