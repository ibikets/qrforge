import Link from "next/link";
import { ActionButton } from "@/components/admin/Mutation";
import { Badge, DataTable, Denied, Empty, LoadError, PageHead, Panel, Td, lagos, linkCls } from "@/components/admin/kit";
import { currentStaff } from "@/lib/admin/guard";
import { adm, load, one, PAGE_SIZE, pageNum } from "@/lib/admin/read";
import { isMissingTable } from "@/lib/pages/server";

type Row = { id: string; user_id: string; kind: string; title: string; public_id: string; lifecycle: string; taken_down_at: string | null; updated_at: string };

export default async function Pages({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await currentStaff();
  if (s.status !== "ok" || !s.staff.caps.has("pages.read")) return <Denied />;
  const canTakedown = s.staff.caps.has("pages.takedown");
  const sp = await searchParams;
  const term = one(sp.q).trim().toLowerCase().replace(/[^a-z2-9]/g, "").slice(0, 10);
  const page = pageNum(sp.page);
  const rows = await load(async () => {
    let q = adm().from("pages").select("id,user_id,kind,title,public_id,lifecycle,taken_down_at,updated_at", { count: "exact" }).neq("lifecycle", "deleted").order("updated_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (term) q = q.eq("public_id", term);
    const r = await q;
    if (r.error) { if (isMissingTable(r.error)) return null; throw new Error(r.error.message); }
    return (r.data ?? []) as Row[];
  });
  return (
    <>
      <PageHead title="Pages" lead="Hosted pages created by customers. You see the title, status and address only, never the content. Use takedown for abuse reports; the owner is shown a clear notice." />
      <form method="get" role="search" aria-label="Find a page by address" className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="pq" className="mb-1 block text-sm font-medium">Public address (the 10 characters after /p/)</label>
          <input id="pq" name="q" defaultValue={term} maxLength={10} className="min-h-11 rounded-control border border-control-border bg-transparent px-3 text-base" />
        </div>
        <button className="min-h-11 rounded-control border border-brand px-4 font-medium text-brand">Find</button>
        {term ? <Link href="/admin/pages" className={linkCls}>Clear</Link> : null}
      </form>
      <Panel>
        {!rows.ok ? <LoadError what="pages" /> : rows.data === null ? (
          <Empty title="Hosted pages are not set up yet">The database update for hosted pages has not been applied.</Empty>
        ) : rows.data.length === 0 ? (
          <Empty title={term ? "No page has that address" : "No pages yet"}>{term ? "Check the address and try again." : "Pages appear here when customers create them."}</Empty>
        ) : (
          <DataTable label="Hosted pages" head={["Title", "Address", "Status", "Owner", "Updated", "Action"]}>
            {rows.data.map((r) => (
              <tr key={r.id}>
                <Td>{r.title}</Td>
                <Td><a className={linkCls} href={`/p/${r.public_id}`} target="_blank" rel="noopener noreferrer">/p/{r.public_id}</a></Td>
                <Td>{r.taken_down_at ? <Badge tone="bad">Disabled</Badge> : <Badge tone={r.lifecycle === "published" ? "good" : "neutral"}>{r.lifecycle}</Badge>}</Td>
                <Td>{s.staff.caps.has("customers.read") ? <Link className={linkCls} href={`/admin/customers/${r.user_id}`}>Open customer</Link> : "–"}</Td>
                <Td>{lagos(r.updated_at)}</Td>
                <Td>
                  {canTakedown ? (
                    r.taken_down_at ? (
                      <ActionButton endpoint="/api/admin/pages" payload={{ action: "restore", page_id: r.id }} label="Re-enable" title="Re-enable this page?" effect={<>The page can be published and viewed again. Its address is /p/{r.public_id}.</>} />
                    ) : (
                      <ActionButton endpoint="/api/admin/pages" payload={{ action: "takedown", page_id: r.id }} label="Disable" variant="danger" title="Disable this page?" effect={<>The public address /p/{r.public_id} stops working immediately and the owner cannot republish it. Nothing is deleted.</>} />
                    )
                  ) : "–"}
                </Td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>
    </>
  );
}
