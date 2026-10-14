import Link from "next/link";
import { Blocked, DataTable, Denied, Empty, KV, LoadError, PageHead, Panel, Td, kobo, lagos, linkCls } from "@/components/admin/kit";
import { currentStaff } from "@/lib/admin/guard";
import { adm, load, one, q } from "@/lib/admin/read";

const RANGES = [7, 30, 90];

export default async function Statistics({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await currentStaff();
  if (s.status !== "ok" || !(["stats.financial", "stats.operational", "stats.content"] as const).some((c) => s.staff.caps.has(c))) return <Denied />;
  const { caps } = s.staff;
  const sp = await searchParams;
  const days = RANGES.includes(Number(one(sp.days))) ? Number(one(sp.days)) : 30;
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 3600_000);
  const stats = await load(async () => q(await adm().rpc("stats_summary", { p_from: from.toISOString(), p_to: to.toISOString() })) as Record<string, number>);
  const daily = caps.has("stats.financial") ? await load(async () => q(await adm().rpc("payments_by_day", { p_from: from.toISOString(), p_to: to.toISOString() })) as { day: string; payments: number; gross_kobo: number; discount_kobo: number }[]) : null;
  const st = stats.ok ? stats.data : null;
  const max = daily?.ok ? Math.max(1, ...daily.data.map((d) => Number(d.gross_kobo))) : 1;

  return (
    <>
      <PageHead title="Statistics" lead={`${lagos(from.toISOString())} to ${lagos(to.toISOString())}. Dates are Lagos time. Amounts are in naira. Read from the database just now.`} />
      <nav aria-label="Range" className="mb-6 flex gap-4 text-sm">
        {RANGES.map((r) => (<Link key={r} href={`/admin/statistics?days=${r}`} className={linkCls} aria-current={days === r ? "page" : undefined}>Last {r} days</Link>))}
      </nav>
      {!stats.ok ? <LoadError what="statistics" /> : null}
      {st && caps.has("stats.operational") ? (
        <Panel title="Customers and saved codes">
          <KV items={[["All accounts", st.customers_total], ["New accounts in range", st.customers_new], ["Paid accounts active now", st.paid_accounts_active], ["Saved codes (all accounts)", st.saved_codes_total], ["Open support tickets", st.tickets_open]]} />
        </Panel>
      ) : null}
      {st && caps.has("stats.financial") ? (
        <Panel title="Payments" aside={<span className="text-[13px] text-muted">Basis: confirmed payments, gross</span>}>
          <KV items={[["Payments confirmed", st.payments_confirmed], ["Amount collected", kobo(st.gross_kobo)], ["Discounts given", kobo(st.discount_kobo)], ["Offer redemptions used", st.redemptions_consumed], ["Refund requests waiting", st.refund_requests_open], ["Refunds sent", kobo(st.refunds_executed_kobo)]]} />
          <p className="mt-3 text-[13px] text-muted">Collected is what customers paid. It is not profit: provider fees and refunds are not netted off.</p>
          <h3 className="mb-2 mt-6 font-medium">By day</h3>
          {!daily?.ok ? <LoadError what="the daily figures" /> : daily.data.length === 0 ? <Empty title="No confirmed payments in this range" /> : (
            <DataTable label="Confirmed payments by day" head={["Day", "Payments", "Collected", "Discounts", ""]}>
              {daily.data.map((d) => (
                <tr key={d.day}>
                  <Td>{d.day}</Td><Td>{d.payments}</Td><Td>{kobo(Number(d.gross_kobo))}</Td><Td>{Number(d.discount_kobo) ? kobo(Number(d.discount_kobo)) : "–"}</Td>
                  <Td><span aria-hidden className="inline-block h-2 rounded bg-brand" style={{ width: `${Math.max(2, (Number(d.gross_kobo) / max) * 120)}px` }} /></Td>
                </tr>
              ))}
            </DataTable>
          )}
        </Panel>
      ) : null}
      {st && caps.has("stats.content") ? (
        <Panel title="Content"><KV items={[["Landing drafts not published", st.drafts_unpublished]]} /></Panel>
      ) : null}
      <Panel title="Not measured">
        <Blocked title="Scans, exports and downloads" dependency="Event instrumentation that records counts without storing code contents. Codes are static and generated in the browser, so scans cannot be counted and downloads are not logged. Saved-code totals above are real, but they are not usage or scan figures." />
      </Panel>
    </>
  );
}
