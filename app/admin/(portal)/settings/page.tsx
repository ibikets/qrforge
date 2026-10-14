import { Badge, DataTable, Denied, KV, LoadError, Notice, PageHead, Panel, Td, lagos } from "@/components/admin/kit";
import { ActionButton, EditorForm } from "@/components/admin/Mutation";
import { SETTING_KEYS } from "@/lib/admin/consts";
import { currentStaff } from "@/lib/admin/guard";
import { presence, runChecks } from "@/lib/admin/integrations";
import { adm, load, q } from "@/lib/admin/read";

const LABEL: Record<(typeof SETTING_KEYS)[number], [string, string]> = {
  support_email: ["Support email", "Shown to customers only once a monitored inbox exists."],
  support_url: ["Support page", "A real page customers can use to get help."],
  terms_url: ["Terms of service", "Must be the real, published terms."],
  privacy_url: ["Privacy policy", "Must be the real, published policy."],
  refund_policy_url: ["Refund policy", "Must be the real, published policy."],
  company_url: ["Company website", "Expected: bitzpark.com."],
};

export default async function Settings() {
  const s = await currentStaff();
  if (s.status !== "ok" || !s.staff.caps.has("settings.manage")) return <Denied />;
  const rows = await load(async () => q(await adm().from("app_settings").select("key,value,version,updated_at")) as { key: string; value: string; version: number; updated_at: string }[]);
  const checks = await runChecks();
  const p = presence();
  const site = p.site ?? "https://<your-site>";
  let supaHost = "<project>.supabase.co";
  try { supaHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host; } catch { /* keep placeholder */ }
  return (
    <>
      <PageHead title="Settings" lead="Public links and support details. Secrets are never edited here; they live in the host’s secure configuration." />
      <Notice>Customer-facing legal and support details stay hidden until you add real ones here. Do not enter placeholders.</Notice>
      <Panel title="Links and support details">
        {!rows.ok ? <LoadError what="settings" /> : (
          <div className="grid gap-8">
            {SETTING_KEYS.map((k) => {
              const cur = rows.data.find((r) => r.key === k);
              return (
                <div key={k} className="border-b border-divider pb-6">
                  <EditorForm endpoint="/api/admin/settings" extra={{ action: "set", key: k, version: cur?.version ?? 0 }} initial={{ value: cur?.value ?? "" }}
                    fields={[{ name: "value", label: LABEL[k][0], type: k === "support_email" ? "email" : "url", required: true, help: cur ? `${LABEL[k][1]} Last changed ${lagos(cur.updated_at)}.` : `${LABEL[k][1]} Not set.` }]}
                    submitLabel="Save" />
                  {cur ? <div className="mt-3"><ActionButton endpoint="/api/admin/settings" payload={{ action: "clear", key: k }} label={`Remove ${LABEL[k][0].toLowerCase()}`} variant="ghost" confirmLabel="Remove" title={`Remove ${LABEL[k][0]}?`} effect="Customers stop seeing it." /></div> : null}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
      <Panel title="Service connections" aside={<span className="text-[13px] text-muted">Checked just now</span>}>
        <DataTable label="Verified connections" head={["Connection", "Result", "Detail", "Checked"]}>
          {checks.map((c) => (
            <tr key={c.name}><Td>{c.name}</Td><Td><Badge tone={c.state === "verified" ? "good" : c.state === "failed" ? "bad" : "warn"}>{c.state === "verified" ? "Working" : c.state === "failed" ? "Problem" : "Not verified"}</Badge></Td><Td>{c.detail}</Td><Td>{lagos(c.checkedAt)}</Td></tr>
          ))}
        </DataTable>
        <h3 className="mb-2 mt-6 font-medium">Present on this deployment</h3>
        <KV items={p.flags.map(([n, ok]) => [n, <Badge key={n} tone={ok ? "good" : "warn"}>{ok ? "Set" : "Not set"}</Badge>])} />
        <h3 className="mb-2 mt-6 font-medium">Addresses the providers must have</h3>
        <p className="mb-3 text-sm text-muted">These cannot be confirmed from here. Check each in the provider’s dashboard: <Badge tone="warn">Not verified</Badge></p>
        <DataTable label="Provider address mapping" head={["Where", "Setting", "Value"]}>
          <tr><Td>Payment provider</Td><Td>Webhook address</Td><Td className="break-all">{site}/api/paystack/webhook</Td></tr>
          <tr><Td>Payment provider</Td><Td>Return address (sent with each payment)</Td><Td className="break-all">{site}/billing/callback</Td></tr>
          <tr><Td>Google</Td><Td>Authorised redirect address</Td><Td className="break-all">https://{supaHost}/auth/v1/callback</Td></tr>
          <tr><Td>Sign-in service</Td><Td>Site address</Td><Td className="break-all">{site}</Td></tr>
          <tr><Td>Sign-in service</Td><Td>Redirect allow-list</Td><Td className="break-all">{site}/auth/callback</Td></tr>
        </DataTable>
      </Panel>
    </>
  );
}
