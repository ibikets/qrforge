import { Badge, Blocked, DataTable, Denied, Empty, KV, Notice, PageHead, Panel, Td, lagos } from "@/components/admin/kit";
import { ActionButton } from "@/components/admin/Mutation";
import { currentStaff } from "@/lib/admin/guard";
import { adm, load, q } from "@/lib/admin/read";

export default async function Releases() {
  const s = await currentStaff();
  if (s.status !== "ok" || !s.staff.caps.has("releases.manage")) return <Denied />;
  const pending = await load(async () => {
    const r = await adm().from("redemptions").select("id", { count: "exact", head: true }).eq("state", "reserved").lt("expires_at", new Date().toISOString());
    if (r.error) throw r.error;
    return r.count ?? 0;
  });
  const runs = await load(async () => q(await adm().from("audit_events").select("id,at,actor_email,after_state").eq("action", "maintenance.run").order("id", { ascending: false }).limit(5)) as { id: number; at: string; actor_email: string | null; after_state: { released?: number } | null }[]);
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  return (
    <>
      <PageHead title="Releases" lead="Approved, tested builds with staged promotion. Nothing here runs code, SQL or a terminal." />
      <Panel title="This deployment">
        <KV items={[
          ["Environment", process.env.VERCEL_ENV ?? "local"],
          ["Commit", sha ? sha.slice(0, 7) : "Not reported by this host"],
          ["Deployment", process.env.VERCEL_DEPLOYMENT_ID ?? "Not reported by this host"],
        ]} />
      </Panel>
      <Panel title="Approved builds">
        <Blocked title="Build list, promotion and rollback" dependency="A Vercel access token granted to the portal, plus a list of builds that passed their checks. Without them the portal cannot show real build evidence or promote anything, so it will not pretend to.">
          Review the tested build, the current deployment and the rollback target before promoting. Code rollback does not roll data back, so changes that need a database update are deployed in a stated order.
        </Blocked>
      </Panel>
      <Panel title="Maintenance">
        <Notice>Only the jobs listed here can run. Each shows what it will touch first, and each run is recorded.</Notice>
        <DataTable label="Maintenance jobs" head={["Job", "Will affect", "Last runs", ""]}>
          <tr>
            <Td><strong>Release expired offer holds</strong><span className="block text-[13px] text-muted">Frees offer slots held by checkouts that were never paid.</span></Td>
            <Td>{pending.ok ? `${pending.data} expired holds` : "Unknown: could not load"}</Td>
            <Td>
              {!runs.ok ? "Could not load" : runs.data.length === 0 ? "Never run from here" : runs.data.map((r) => (<span key={r.id} className="block text-[13px]">{lagos(r.at)} · released {r.after_state?.released ?? 0}</span>))}
            </Td>
            <Td>
              <ActionButton endpoint="/api/admin/jobs" payload={{ action: "run", job: "release_expired_reservations" }} label="Run job" variant="primary" confirmLabel="Run now" title="Run “Release expired offer holds”?"
                effect={<>{pending.ok ? `${pending.data} expired holds will be released.` : "The number of holds could not be checked."} Paid and unexpired holds are never touched. It finishes immediately.</>} disabledReason={pending.ok && pending.data === 0 ? "Nothing to release." : undefined} />
            </Td>
          </tr>
        </DataTable>
        {runs.ok && runs.data.length === 0 ? <div className="mt-4"><Empty title="No job runs recorded" /></div> : null}
        <p className="mt-4 text-sm text-muted">Job status: <Badge tone="good">Completes within the request</Badge> A run is reported as finished only after the database confirms it.</p>
      </Panel>
    </>
  );
}
