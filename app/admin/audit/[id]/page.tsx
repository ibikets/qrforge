import Link from "next/link";
import { notFound } from "next/navigation";
import { Denied, KV, LoadError, PageHead, Panel, lagos, linkCls } from "@/components/admin/kit";
import { currentStaff } from "@/lib/admin/guard";
import { adm, load, q } from "@/lib/admin/read";

export default async function AuditEvent({ params }: { params: Promise<{ id: string }> }) {
  const s = await currentStaff();
  if (s.status !== "ok" || !(s.staff.caps.has("audit.read_all") || s.staff.caps.has("audit.read_own"))) return <Denied />;
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1) notFound();
  const r = await load(async () => q(await adm().from("audit_events").select("*").eq("id", n).maybeSingle()));
  if (!r.ok) return (<><PageHead title="Audit entry" /><LoadError what="this entry" /></>);
  const e = r.data;
  // A staff member without full audit access can open only their own entries (checked here, on the server).
  if (!e || (!s.staff.caps.has("audit.read_all") && e.actor_id !== s.staff.userId)) notFound();
  const json = (v: unknown) => (v && Object.keys(v as object).length ? JSON.stringify(v, null, 2) : "None recorded");
  return (
    <>
      <PageHead title="Audit entry" lead={`#${e.id}`} actions={<Link href="/admin/audit" className={linkCls}>All entries</Link>} />
      <Panel>
        <KV items={[["When", lagos(e.at)], ["Who", `${e.actor_email ?? "System"}${e.actor_role ? ` (${e.actor_role})` : ""}`], ["Action", e.action], ["Target", e.target_type ? `${e.target_type} ${e.target_id ?? ""}` : "–"], ["Reason", e.reason ?? "–"], ["Correlation", e.correlation_id ?? "–"]]} />
      </Panel>
      <Panel title="Before">
        <pre tabIndex={0} className="overflow-x-auto rounded-control bg-soft p-4 text-[13px]">{json(e.before_state)}</pre>
      </Panel>
      <Panel title="After">
        <pre tabIndex={0} className="overflow-x-auto rounded-control bg-soft p-4 text-[13px]">{json(e.after_state)}</pre>
        <p className="mt-3 text-[13px] text-muted">Sensitive values were removed before this entry was saved.</p>
      </Panel>
    </>
  );
}
