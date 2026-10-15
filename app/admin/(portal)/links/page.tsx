import Link from "next/link";
import { ActionButton } from "@/components/admin/Mutation";
import { Badge, DataTable, Denied, Empty, LoadError, PageHead, Panel, Td, lagos, linkCls } from "@/components/admin/kit";
import { currentStaff } from "@/lib/admin/guard";
import { adm, load, one, PAGE_SIZE, pageNum } from "@/lib/admin/read";
import { SLUG } from "@/lib/links";
import { isMissingTable } from "@/lib/pages/server";

type Row = { id: string; user_id: string; slug: string; destination: string; state: string; taken_down_at: string | null; deleted_at: string | null; updated_at: string; rules: { ios?: string; android?: string; schedule?: unknown[] } };

export default async function Links({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await currentStaff();
  if (s.status !== "ok" || !s.staff.caps.has("pages.read")) return <Denied />;
  const canTakedown = s.staff.caps.has("pages.takedown");
  const sp = await searchParams;
  const term = one(sp.q).trim().toLowerCase().replace(/[^a-z0-9.\-]/g, "").slice(0, 100);
  const only = one(sp.only) === "disabled";
  const page = pageNum(sp.page);
  const rows = await load(async () => {
    let q = adm().from("links").select("id,user_id,slug,destination,state,taken_down_at,deleted_at,updated_at,rules", { count: "exact" }).is("deleted_at", null).order("updated_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (SLUG.test(term)) q = q.eq("slug", term); else if (term) q = q.ilike("destination", `%${term}%`);
    if (only) q = q.not("taken_down_at", "is", null);
    const r = await q;
    if (r.error) { if (isMissingTable(r.error)) return null; throw new Error(r.error.message); }
    return (r.data ?? []) as Row[];
  });
  return (
    <>
      <PageHead title="Links" lead="Dynamic links created by customers. You see the address, where it sends visitors and its status, never the customer's name for the link or any visitor data. Disabling needs a reason, is recorded in the audit log and can be undone." />
      <form method="get" role="search" aria-label="Find a link" className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="lq" className="mb-1 block text-sm font-medium">Address (8 characters after /l/) or part of the destination</label>
          <input id="lq" name="q" defaultValue={term} maxLength={100} className="min-h-11 rounded-control border border-control-border bg-transparent px-3 text-base" />
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="only" value="disabled" defaultChecked={only} /> Only disabled links</label>
        <button className="min-h-11 rounded-control border border-brand px-4 font-medium text-brand">Find</button>
        {term || only ? <Link href="/admin/links" className={linkCls}>Clear</Link> : null}
      </form>
      <Panel>
        {!rows.ok ? <LoadError what="links" /> : rows.data === null ? (
          <Empty title="Dynamic links are not set up yet">The database update for dynamic links has not been applied.</Empty>
        ) : rows.data.length === 0 ? (
          <Empty title={term || only ? "No link matches" : "No links yet"}>{term || only ? "Check the search and try again." : "Links appear here when customers create them."}</Empty>
        ) : (
          <DataTable label="Dynamic links" head={["Address", "Main destination", "Other routes", "Status", "Owner", "Updated", "Action"]}>
            {rows.data.map((r) => {
              const extra = [r.rules?.ios ? "iPhone" : "", r.rules?.android ? "Android" : "", r.rules?.schedule?.length ? `${r.rules.schedule.length} timed` : ""].filter(Boolean).join(", ");
              return (
                <tr key={r.id}>
                  <Td><a className={linkCls} href={`/l/${r.slug}`} target="_blank" rel="noopener noreferrer nofollow">/l/{r.slug}</a></Td>
                  <Td><span className="break-all">{r.destination}</span></Td>
                  <Td>{extra || "–"}</Td>
                  <Td>{r.taken_down_at ? <Badge tone="bad">Disabled</Badge> : <Badge tone={r.state === "active" ? "good" : "neutral"}>{r.state === "active" ? "Active" : "Paused"}</Badge>}</Td>
                  <Td>{s.staff.caps.has("customers.read") ? <Link className={linkCls} href={`/admin/customers/${r.user_id}`}>Open customer</Link> : "–"}</Td>
                  <Td>{lagos(r.updated_at)}</Td>
                  <Td>
                    {canTakedown ? (
                      r.taken_down_at ? (
                        <ActionButton endpoint="/api/admin/links" payload={{ action: "restore", link_id: r.id }} label="Re-enable" title="Re-enable this link?" effect={<>/l/{r.slug} redirects visitors again and its owner can edit it.</>} />
                      ) : (
                        <ActionButton endpoint="/api/admin/links" payload={{ action: "takedown", link_id: r.id }} label="Disable" variant="danger" title="Disable this link?" effect={<>/l/{r.slug} stops redirecting immediately and shows “This link isn’t available”. The owner cannot change or re-enable it. Nothing is deleted.</>} />
                      )
                    ) : "–"}
                  </Td>
                </tr>
              );
            })}
          </DataTable>
        )}
      </Panel>
    </>
  );
}
