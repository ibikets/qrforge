import Link from "next/link";
import { Badge, DataTable, Denied, Empty, LoadError, PageHead, Panel, Td, lagos, linkCls } from "@/components/admin/kit";
import { LinkButton } from "@/components/ui/Button";
import { CAMPAIGN_STATE } from "@/lib/admin/campaign-view";
import { currentStaff } from "@/lib/admin/guard";
import { adm, load, q } from "@/lib/admin/read";

type C = { id: string; name: string; slug: string; delivery: string; plans: string[]; discount_kind: string; basis_points: number | null; fixed_kobo: number | null; starts_at: string; ends_at: string; state: string; total_limit: number | null };

export default async function Discounts() {
  const s = await currentStaff();
  if (s.status !== "ok" || !(s.staff.caps.has("campaigns.draft") || s.staff.caps.has("campaigns.publish"))) return <Denied />;
  const rows = await load(async () => {
    const db = adm();
    const [c, r] = await Promise.all([
      db.from("campaigns").select("id,name,slug,delivery,plans,discount_kind,basis_points,fixed_kobo,starts_at,ends_at,state,total_limit").order("created_at", { ascending: false }).limit(100),
      db.from("redemptions").select("campaign_id,state").in("state", ["reserved", "consumed"]).limit(5000),
    ]);
    const counts = new Map<string, { used: number; held: number }>();
    for (const x of q(r) as { campaign_id: string; state: string }[]) {
      const e = counts.get(x.campaign_id) ?? { used: 0, held: 0 };
      if (x.state === "consumed") e.used++; else e.held++;
      counts.set(x.campaign_id, e);
    }
    return { list: q(c) as C[], counts };
  });
  const now = Date.now();
  return (
    <>
      <PageHead title="Discounts" lead="First-payment offers. Billing drafts; the Owner publishes. Offers never stack and never change a payment that has already settled."
        actions={s.staff.caps.has("campaigns.draft") ? <LinkButton href="/admin/discounts/new">New offer</LinkButton> : undefined} />
      <Panel>
        {!rows.ok ? <LoadError what="offers" /> : rows.data.list.length === 0 ? <Empty title="No offers yet">No promotion is running. Prices on the website are the plan prices.</Empty> : (
          <DataTable label="Offers" head={["Offer", "Who sees it", "Discount", "Window (Lagos)", "Uses", "Status"]}>
            {rows.data.list.map((c) => {
              const [label, tone] = CAMPAIGN_STATE[c.state] ?? [c.state, "neutral" as const];
              const ended = ["active", "scheduled"].includes(c.state) && new Date(c.ends_at).getTime() < now;
              const cn = rows.data.counts.get(c.id) ?? { used: 0, held: 0 };
              return (
                <tr key={c.id}>
                  <Td><Link href={`/admin/discounts/${c.id}`} className={linkCls}>{c.name}</Link><span className="block text-[13px] text-muted">{c.slug} · {c.plans.join(", ")}</span></Td>
                  <Td>{c.delivery === "public" ? "Public" : c.delivery === "private" ? "Private code" : "Targeted"}</Td>
                  <Td>{c.discount_kind === "percent" ? `${(c.basis_points ?? 0) / 100}%` : `₦${((c.fixed_kobo ?? 0) / 100).toLocaleString("en-US")}`}</Td>
                  <Td>{lagos(c.starts_at)}<br />to {lagos(c.ends_at)}</Td>
                  <Td>{cn.used}{c.total_limit ? ` of ${c.total_limit}` : ""}{cn.held ? <span className="block text-[13px] text-muted">{cn.held} held</span> : null}</Td>
                  <Td><Badge tone={ended ? "neutral" : tone}>{ended ? "Ended" : label}</Badge></Td>
                </tr>
              );
            })}
          </DataTable>
        )}
      </Panel>
    </>
  );
}
