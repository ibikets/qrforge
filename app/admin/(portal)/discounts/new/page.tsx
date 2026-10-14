import Link from "next/link";
import CampaignForm from "@/components/admin/CampaignForm";
import { Denied, PageHead, Panel, linkCls } from "@/components/admin/kit";
import { currentStaff } from "@/lib/admin/guard";

export default async function NewOffer() {
  const s = await currentStaff();
  if (s.status !== "ok" || !s.staff.caps.has("campaigns.draft")) return <Denied />;
  return (
    <>
      <PageHead title="New offer" lead="Saved as a draft. Nothing is live until the Owner publishes it." actions={<Link href="/admin/discounts" className={linkCls}>All offers</Link>} />
      <Panel>
        <CampaignForm initial={{ discount_kind: "percent", plans: ["pro"], audience: "new_paid", delivery: "public", per_customer_limit: 1, priority: 0, percent: "", fixed_naira: "", starts_at: "", ends_at: "" }} />
      </Panel>
    </>
  );
}
