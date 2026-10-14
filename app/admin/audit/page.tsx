import Link from "next/link";
import { DataTable, Denied, Empty, LoadError, PageHead, Panel, Td, lagos, linkCls } from "@/components/admin/kit";
import { currentStaff } from "@/lib/admin/guard";
import { adm, load, one, PAGE_SIZE, pageNum } from "@/lib/admin/read";

type E = { id: number; at: string; actor_email: string | null; actor_role: string | null; action: string; target_type: string | null; target_id: string | null };

export default async function Audit({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await currentStaff();
  if (s.status !== "ok" || !(s.staff.caps.has("audit.read_all") || s.staff.caps.has("audit.read_own"))) return <Denied />;
  const all = s.staff.caps.has("audit.read_all");
  const sp = await searchParams;
  const action = one(sp.action).trim().slice(0, 60).replace(/[%_,()*]/g, "");
  const page = pageNum(sp.page);
  const rows = await load(async () => {
    let qy = adm().from("audit_events").select("id,at,actor_email,actor_role,action,target_type,target_id", { count: "exact" }).order("id", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (!all) qy = qy.eq("actor_id", s.staff.userId);
    if (action) qy = qy.ilike("action", `%${action}%`);
    const r = await qy;
    if (r.error) throw r.error;
    return { list: r.data as E[], total: r.count ?? 0 };
  });
  const qs = (p: number) => `/admin/audit?${new URLSearchParams({ ...(action ? { action } : {}), page: String(p) })}`;
  return (
    <>
      <PageHead title="Audit" lead={all ? "Every management action, newest first. Entries cannot be edited or deleted." : "Your own management actions. Entries cannot be edited or deleted."} />
      <form method="get" role="search" aria-label="Filter audit" className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="aa" className="mb-1 block text-sm font-medium">Action contains</label>
          <input id="aa" name="action" defaultValue={action} maxLength={60} className="min-h-11 rounded-control border border-control-border bg-transparent px-3 text-base" />
        </div>
        <button className="min-h-11 rounded-control border border-brand px-4 font-medium text-brand">Filter</button>
        {action ? <Link href="/admin/audit" className={linkCls}>Clear</Link> : null}
      </form>
      <Panel>
        {!rows.ok ? <LoadError what="the audit log" /> : rows.data.list.length === 0 ? (action ? <Empty title="No entries match this filter" /> : <Empty title="Nothing recorded yet" />) : (
          <>
            <DataTable label="Audit events" head={["When", "Who", "Role", "Action", "Target"]}>
              {rows.data.list.map((e) => (
                <tr key={e.id}>
                  <Td>{lagos(e.at)}</Td><Td>{e.actor_email ?? "System"}</Td><Td>{e.actor_role ?? "–"}</Td>
                  <Td><Link href={`/admin/audit/${e.id}`} className={linkCls}>{e.action}</Link></Td>
                  <Td>{e.target_type ? `${e.target_type}${e.target_id ? ` · ${e.target_id.slice(0, 12)}` : ""}` : "–"}</Td>
                </tr>
              ))}
            </DataTable>
            <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pages">
              <span className="text-muted">Page {page} · {rows.data.total} entries</span>
              <span className="flex gap-4">
                {page > 1 ? <Link href={qs(page - 1)} className={linkCls}>Newer</Link> : null}
                {page * PAGE_SIZE < rows.data.total ? <Link href={qs(page + 1)} className={linkCls}>Older</Link> : null}
              </span>
            </nav>
          </>
        )}
      </Panel>
    </>
  );
}
