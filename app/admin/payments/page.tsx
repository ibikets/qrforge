import Link from "next/link";
import { Badge, DataTable, Denied, Empty, LoadError, PageHead, Panel, Td, kobo, lagos, linkCls } from "@/components/admin/kit";
import { currentStaff } from "@/lib/admin/guard";
import { adm, load, one, PAGE_SIZE, pageNum, q } from "@/lib/admin/read";

type P = { reference: string; user_id: string; plan: string; amount_kobo: number; base_kobo: number | null; discount_kobo: number; status: string; created_at: string };

export default async function Payments({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await currentStaff();
  if (s.status !== "ok" || !s.staff.caps.has("payments.read")) return <Denied />;
  const sp = await searchParams;
  const ref = one(sp.ref).trim().slice(0, 80).replace(/[%_,()*]/g, "");
  const page = pageNum(sp.page);
  const rows = await load(async () => {
    const db = adm();
    let qy = db.from("payments").select("reference,user_id,plan,amount_kobo,base_kobo,discount_kobo,status,created_at", { count: "exact" }).order("created_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (ref) qy = qy.ilike("reference", `%${ref}%`);
    const r = await qy;
    if (r.error) throw r.error;
    const ids = [...new Set((r.data as P[]).map((p) => p.user_id))];
    const emails = new Map<string, string>();
    await Promise.all(ids.map(async (id) => { const u = await db.auth.admin.getUserById(id); if (u.data?.user?.email) emails.set(id, u.data.user.email); }));
    return { list: r.data as P[], total: r.count ?? 0, emails };
  });
  return (
    <>
      <PageHead title="Payments" lead="Confirmed payments. The payment provider’s record decides the outcome." />
      <form method="get" role="search" aria-label="Find a payment" className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="pr" className="mb-1 block text-sm font-medium">Reference contains</label>
          <input id="pr" name="ref" defaultValue={ref} maxLength={80} className="min-h-11 rounded-control border border-control-border bg-transparent px-3 text-base" />
        </div>
        <button className="min-h-11 rounded-control border border-brand px-4 font-medium text-brand">Search</button>
        {ref ? <Link href="/admin/payments" className={linkCls}>Clear</Link> : null}
      </form>
      <Panel>
        {!rows.ok ? <LoadError what="payments" /> : rows.data.list.length === 0 ? (ref ? <Empty title="No payments match that reference" /> : <Empty title="No payments yet">Confirmed payments appear here.</Empty>) : (
          <>
            <DataTable label="Payments" head={["Date", "Customer", "Plan", "Normal price", "Discount", "Paid", "Status"]}>
              {rows.data.list.map((p) => (
                <tr key={p.reference}>
                  <Td><Link href={`/admin/payments/${encodeURIComponent(p.reference)}`} className={linkCls}>{lagos(p.created_at)}</Link></Td>
                  <Td>{rows.data.emails.get(p.user_id) ?? "Unknown"}</Td>
                  <Td>{p.plan}</Td>
                  <Td>{kobo(p.base_kobo ?? p.amount_kobo)}</Td>
                  <Td>{p.discount_kobo ? kobo(p.discount_kobo) : "–"}</Td>
                  <Td>{kobo(p.amount_kobo)}</Td>
                  <Td><Badge tone={p.status === "success" ? "good" : "warn"}>{p.status === "success" ? "Confirmed" : p.status}</Badge></Td>
                </tr>
              ))}
            </DataTable>
            <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pages">
              <span className="text-muted">Page {page} · {rows.data.total} payments</span>
              <span className="flex gap-4">
                {page > 1 ? <Link href={`/admin/payments?${new URLSearchParams({ ...(ref ? { ref } : {}), page: String(page - 1) })}`} className={linkCls}>Previous</Link> : null}
                {page * PAGE_SIZE < rows.data.total ? <Link href={`/admin/payments?${new URLSearchParams({ ...(ref ? { ref } : {}), page: String(page + 1) })}`} className={linkCls}>Next</Link> : null}
              </span>
            </nav>
          </>
        )}
      </Panel>
    </>
  );
}
