import Link from "next/link";
import { notFound } from "next/navigation";
import CampaignForm from "@/components/admin/CampaignForm";
import { Badge, DataTable, Denied, Empty, KV, LoadError, Notice, PageHead, Panel, Td, kobo, lagos, linkCls } from "@/components/admin/kit";
import { ActionButton } from "@/components/admin/Mutation";
import { CAMPAIGN_STATE, savingKobo, toLagosInput } from "@/lib/admin/campaign-view";
import { currentStaff } from "@/lib/admin/guard";
import { adm, load, q } from "@/lib/admin/read";
import { PLANS } from "@/lib/plans";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EP = "/api/admin/campaigns";

export default async function Offer({ params }: { params: Promise<{ id: string }> }) {
  const s = await currentStaff();
  if (s.status !== "ok" || !(s.staff.caps.has("campaigns.draft") || s.staff.caps.has("campaigns.publish"))) return <Denied />;
  const { caps } = s.staff;
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const data = await load(async () => {
    const db = adm();
    const c = q(await db.from("campaigns").select("*").eq("id", id).maybeSingle());
    if (!c) return null;
    const [reds, targets, prices, versions] = await Promise.all([
      db.from("redemptions").select("id,state,reference,reserved_at,consumed_at,expires_at").eq("campaign_id", id).order("reserved_at", { ascending: false }).limit(50),
      db.from("campaign_targets").select("user_id").eq("campaign_id", id),
      db.from("plan_versions").select("plan,base_kobo,effective_at").eq("state", "published").lte("effective_at", new Date().toISOString()).order("effective_at", { ascending: false }),
      db.from("campaign_versions").select("version,published_at").eq("campaign_id", id).order("version", { ascending: false }).limit(10),
    ]);
    return { c, reds: q(reds) as { id: string; state: string; reference: string | null; reserved_at: string; consumed_at: string | null; expires_at: string }[], targets: (q(targets) as unknown[]).length, prices: q(prices) as { plan: string; base_kobo: number }[], versions: q(versions) as { version: number; published_at: string }[] };
  });
  if (!data.ok) return (<><PageHead title="Offer" /><LoadError what="this offer" /></>);
  if (!data.data) notFound();
  const { c, reds, prices, versions } = data.data;
  const [label, tone] = CAMPAIGN_STATE[c.state] ?? [c.state, "neutral" as const];
  const editable = ["draft", "paused"].includes(c.state) && caps.has("campaigns.draft");
  const base = (p: string) => prices.find((x) => x.plan === p)?.base_kobo;
  const used = reds.filter((r) => r.state === "consumed").length;
  const held = reds.filter((r) => r.state === "reserved").length;

  return (
    <>
      <PageHead title={c.name} lead={`Reference ${c.slug}`} actions={<Link href="/admin/discounts" className={linkCls}>All offers</Link>} />
      <Panel title="Status" aside={<Badge tone={tone}>{label}</Badge>}>
        <KV items={[
          ["Discount", c.discount_kind === "percent" ? `${c.basis_points / 100}% off the first payment` : `${kobo(c.fixed_kobo)} off the first payment`],
          ["Plans", c.plans.map((p: string) => PLANS[p as "pro"].name).join(", ")],
          ["Who can use it", c.audience === "new_paid" ? "Customers who have never paid" : "Any signed-in customer"],
          ["How they get it", c.delivery === "public" ? "Public (applies automatically)" : c.delivery === "private" ? "Private code" : `Targeted (${data.data.targets} customers)`],
          ["Window", `${lagos(c.starts_at)} to ${lagos(c.ends_at)}`],
          ["Limits", `${c.total_limit ?? "No total limit"} total · ${c.per_customer_limit} per customer`],
          ["Used / held", `${used} used · ${held} held for checkouts in progress`],
          ["Version", `${c.version}${versions[0] ? ` (published ${lagos(versions[0].published_at)})` : " (never published)"}`],
        ]} />
      </Panel>

      <Panel title="What customers will see">
        <p className="mb-3 text-sm text-muted">Computed with the same rounding as checkout. The normal price is always shown, and renewal uses it.</p>
        <DataTable label="Preview by plan" head={["Plan", "Normal price", "Saving", "First payment", "Renews at"]}>
          {c.plans.map((p: string) => {
            const b = base(p);
            const sv = b ? savingKobo(c, b) : null;
            return (
              <tr key={p}>
                <Td>{PLANS[p as "pro"].name}</Td>
                <Td>{kobo(b)}</Td>
                <Td>{sv != null ? kobo(sv) : "–"}</Td>
                <Td>{b && sv != null ? (sv >= b ? "Invalid: free" : kobo(b - sv)) : "–"}</Td>
                <Td>{kobo(b)} / 30 days</Td>
              </tr>
            );
          })}
        </DataTable>
        {c.delivery === "public" && c.banner_text ? <p className="mt-4 text-sm">Website notice: <strong>{c.banner_text}</strong></p> : null}
        {c.delivery !== "public" ? <p className="mt-4 text-sm text-muted">Not shown on the website. Landing page prices are not affected by this offer.</p> : null}
      </Panel>

      {caps.has("campaigns.publish") ? (
        <Panel title="Publish and lifecycle">
          {["draft", "paused"].includes(c.state) ? (
            <>
              <Notice>Publishing starts new discounted checkouts{new Date(c.starts_at) > new Date() ? ` from ${lagos(c.starts_at)}` : " immediately"} and freezes this version. Settled payments keep their recorded amount.</Notice>
              <ActionButton endpoint={EP} payload={{ action: "publish", id, version: c.version }} label={c.state === "paused" ? "Resume offer" : "Publish offer"} variant="primary" confirmLabel="Publish" title={`Publish “${c.name}”?`}
                effect={<>{c.discount_kind === "percent" ? `${c.basis_points / 100}%` : kobo(c.fixed_kobo)} off the <strong>first payment</strong> of {c.plans.join(" and ")} for {c.audience === "new_paid" ? "customers who have never paid" : "any signed-in customer"}, {c.delivery === "public" ? "shown publicly" : c.delivery === "private" ? "by code only" : "for listed customers only"}. Ends {lagos(c.ends_at)}. Renewals charge the normal price.</>} />
            </>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-3">
            {["active", "scheduled"].includes(c.state) ? <ActionButton endpoint={EP} payload={{ action: "pause", id }} label="Pause offer" title="Pause this offer?" confirmLabel="Pause" effect="New discounted checkouts stop. Valid initialised payments keep their recorded amount." /> : null}
            {c.state !== "archived" ? <ActionButton endpoint={EP} payload={{ action: "archive", id }} label="Archive" variant="danger" confirmLabel="Archive" title="Archive this offer?" effect="It can no longer be used and leaves this list. Past payments keep their record." /> : null}
          </div>
        </Panel>
      ) : (
        <Panel title="Publish"><p className="text-sm text-muted">Only the Owner publishes, pauses or archives offers.</p></Panel>
      )}

      {editable ? (
        <Panel title="Edit draft">
          <CampaignForm id={id} version={c.version}
            initial={{ name: c.name, slug: c.slug, discount_kind: c.discount_kind, percent: c.basis_points ? c.basis_points / 100 : "", fixed_naira: c.fixed_kobo ? c.fixed_kobo / 100 : "", plans: c.plans, audience: c.audience, delivery: c.delivery, banner_text: c.banner_text ?? "", code: "", keep_code: true, target_emails: "", starts_at: toLagosInput(c.starts_at), ends_at: toLagosInput(c.ends_at), total_limit: c.total_limit ?? "", per_customer_limit: c.per_customer_limit, priority: c.priority, internal_reason: c.internal_reason ?? "" }}
            targetsHint={c.delivery === "targeted" ? `Currently ${data.data.targets} customers. Saving replaces the list with the emails you enter here.` : undefined} />
        </Panel>
      ) : c.state === "active" || c.state === "scheduled" ? (
        <Notice>Pause this offer to edit it. A live offer is frozen so customers never see it change mid-checkout.</Notice>
      ) : null}

      <Panel title="Redemptions">
        {reds.length === 0 ? <Empty title="No redemptions yet" /> : (
          <DataTable label="Redemptions" head={["Reserved", "State", "Reference", "Completed"]}>
            {reds.map((r) => (
              <tr key={r.id}>
                <Td>{lagos(r.reserved_at)}</Td>
                <Td><Badge tone={r.state === "consumed" ? "good" : r.state === "reserved" ? "warn" : "neutral"}>{r.state === "consumed" ? "Used" : r.state === "reserved" ? "Held" : "Released"}</Badge></Td>
                <Td>{r.reference ? (caps.has("payments.read") ? <Link href={`/admin/payments/${encodeURIComponent(r.reference)}`} className={linkCls}>{r.reference.slice(0, 14)}…</Link> : r.reference.slice(0, 14) + "…") : "–"}</Td>
                <Td>{lagos(r.consumed_at)}</Td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>
    </>
  );
}
