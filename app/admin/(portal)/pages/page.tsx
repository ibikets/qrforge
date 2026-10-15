import { kindLabel } from "@/lib/pages/kinds";
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
  const usage = await load(async () => {
    // Counts and sizes only: no file names, paths or content ever leave this query. Aggregated here from the media records, capped to keep the page fast.
    const db = adm(); const CAP = 20000; const by = new Map<string, { files: number; bytes: number; pdf: number; pdfBytes: number; img: number; imgBytes: number }>();
    let seen = 0, truncated = false;
    for (let from = 0; from < CAP; from += 1000) {
      const r = await db.from("page_media").select("user_id,mime,bytes").order("id").range(from, from + 999);
      if (r.error) { if (isMissingTable(r.error)) return null; throw new Error(r.error.message); }
      for (const m of (r.data ?? []) as { user_id: string; mime: string; bytes: number }[]) {
        const u = by.get(m.user_id) ?? { files: 0, bytes: 0, pdf: 0, pdfBytes: 0, img: 0, imgBytes: 0 };
        u.files++; u.bytes += m.bytes; if (m.mime === "application/pdf") { u.pdf++; u.pdfBytes += m.bytes; } else { u.img++; u.imgBytes += m.bytes; }
        by.set(m.user_id, u); seen++;
      }
      if ((r.data ?? []).length < 1000) break;
      if (from + 1000 >= CAP) truncated = true;
    }
    const top = [...by.entries()].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 15);
    const canEmail = s.staff.caps.has("customers.read");
    const named = await Promise.all(top.map(async ([id, u]) => ({ id, u, email: canEmail ? ((await db.auth.admin.getUserById(id)).data?.user?.email ?? null) : null })));
    const tot = [...by.values()].reduce((a, u) => ({ files: a.files + u.files, bytes: a.bytes + u.bytes, pdf: a.pdf + u.pdf, img: a.img + u.img }), { files: 0, bytes: 0, pdf: 0, img: 0 });
    return { named, tot, accounts: by.size, truncated, seen };
  });
  const mb = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(0, Math.round(n / 1024))} KB`);
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
      <Panel title="File usage">
        {!usage.ok ? <LoadError what="file usage" /> : usage.data === null ? <Empty title="Not available yet">The database update for hosted pages has not been applied.</Empty> : usage.data.accounts === 0 ? <Empty title="No uploaded files yet">Files appear here when customers add photos, images or PDFs to pages.</Empty> : (
          <>
            <p className="mb-3 text-sm text-muted">{usage.data.tot.files} files ({usage.data.tot.pdf} PDF, {usage.data.tot.img} image) · {mb(usage.data.tot.bytes)} across {usage.data.accounts} account{usage.data.accounts === 1 ? "" : "s"}. Counts and sizes only; file names and contents are never shown.{usage.data.truncated ? ` Based on the first ${usage.data.seen.toLocaleString()} files.` : ""}</p>
            <DataTable label="Largest storage users" head={["Customer", "Files", "Storage", "PDFs", "Images"]}>
              {usage.data.named.map(({ id, u, email }) => (
                <tr key={id}>
                  <Td>{s.staff.caps.has("customers.read") ? <Link className={linkCls} href={`/admin/customers/${id}`}>{email ?? "Open customer"}</Link> : `Account ${id.slice(0, 8)}`}</Td>
                  <Td>{u.files}</Td><Td>{mb(u.bytes)}</Td><Td>{u.pdf} · {mb(u.pdfBytes)}</Td><Td>{u.img} · {mb(u.imgBytes)}</Td>
                </tr>
              ))}
            </DataTable>
          </>
        )}
      </Panel>
      <Panel>
        {!rows.ok ? <LoadError what="pages" /> : rows.data === null ? (
          <Empty title="Hosted pages are not set up yet">The database update for hosted pages has not been applied.</Empty>
        ) : rows.data.length === 0 ? (
          <Empty title={term ? "No page has that address" : "No pages yet"}>{term ? "Check the address and try again." : "Pages appear here when customers create them."}</Empty>
        ) : (
          <DataTable label="Hosted pages" head={["Title", "Address", "Status", "Owner", "Updated", "Action"]}>
            {rows.data.map((r) => (
              <tr key={r.id}>
                <Td>{r.title}<span className="block text-xs text-muted">{kindLabel(r.kind)}</span></Td>
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
