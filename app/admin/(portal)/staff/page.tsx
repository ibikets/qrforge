import { Badge, DataTable, Denied, Empty, LoadError, PageHead, Panel, Td, lagos } from "@/components/admin/kit";
import InviteForm from "@/components/admin/InviteForm";
import { ActionButton, EditorForm } from "@/components/admin/Mutation";
import { adm, load, q } from "@/lib/admin/read";
import { currentStaff } from "@/lib/admin/guard";
import { CAPS, CAP_LABEL, EXTRA_GRANTS, ROLES, ROLE_LABEL, capsFor, type Role } from "@/lib/admin/permissions";

type M = { user_id: string; email: string; role: Role; extra_grants: string[]; state: string; version: number; created_at: string };
type I = { id: string; email: string; role: Role; expires_at: string; accepted_at: string | null; revoked_at: string | null };
const GRANT_LABEL: Record<string, string> = { "content.publish": "Publish content", "billing.adjust": "Add plan days", "billing.refund_request": "Request refunds", "plans.draft": "Draft prices and offers" };

export default async function Staff() {
  const s = await currentStaff();
  if (s.status !== "ok" || !s.staff.caps.has("staff.manage")) return <Denied />;
  const me = s.staff.userId;
  const d = await load(async () => {
    const db = adm();
    const members = q(await db.from("staff_members").select("*").order("created_at")) as M[];
    const invites = q(await db.from("staff_invites").select("id,email,role,expires_at,accepted_at,revoked_at").order("created_at", { ascending: false }).limit(20)) as I[];
    const mfa = new Map<string, string>();
    await Promise.all(members.map(async (m) => {
      try {
        const r = await db.auth.admin.mfa.listFactors({ userId: m.user_id });
        const ok = r.data?.factors?.some((f: { status: string }) => f.status === "verified");
        mfa.set(m.user_id, r.error ? "Unknown" : ok ? "Set up" : "Not set up");
      } catch { mfa.set(m.user_id, "Unknown"); }
    }));
    return { members, invites, mfa };
  });
  const EP = "/api/admin/staff";
  return (
    <>
      <PageHead title="Staff" lead="Who can use management and what they can do. Access is checked on the server for every action." />
      <Panel title="Members">
        {!d.ok ? <LoadError what="staff" /> : (
          <DataTable label="Staff members" head={["Person", "Role", "Second step", "Status", ""]}>
            {d.data.members.map((m) => (
              <tr key={m.user_id}>
                <Td>{m.email}{m.user_id === me ? <span className="block text-[13px] text-muted">You</span> : null}</Td>
                <Td>{ROLE_LABEL[m.role]}{m.extra_grants.length ? <span className="block text-[13px] text-muted">+ {m.extra_grants.map((g) => GRANT_LABEL[g]).join(", ")}</span> : null}</Td>
                <Td><Badge tone={d.data.mfa.get(m.user_id) === "Set up" ? "good" : "warn"}>{d.data.mfa.get(m.user_id)}</Badge></Td>
                <Td><Badge tone={m.state === "active" ? "good" : "neutral"}>{m.state === "active" ? "Active" : "Access ended"}</Badge></Td>
                <Td>
                  {m.user_id === me ? <span className="text-sm text-muted">Another Owner changes your access</span> : (
                    <div className="flex flex-wrap items-start gap-2">
                      {m.state === "active" ? (
                        <>
                          <details className="min-w-[220px]">
                            <summary className="cursor-pointer text-sm font-medium text-brand">Change access</summary>
                            <div className="mt-3">
                              <EditorForm endpoint={EP} extra={{ action: "change_role", user_id: m.user_id, version: m.version }} initial={{ role_choice: m.role, grants: m.extra_grants }}
                                fields={[
                                  { name: "role_choice", label: "Role", type: "select", options: ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] })) },
                                  { name: "grants", label: "Extra permissions", type: "checkboxes", options: EXTRA_GRANTS.map((g) => ({ value: g, label: GRANT_LABEL[g] })) },
                                ]} submitLabel="Save access" />
                            </div>
                          </details>
                          <ActionButton endpoint={EP} payload={{ action: "revoke", user_id: m.user_id, version: m.version }} label="End access" variant="danger" confirmLabel="End access" title={`End access for ${m.email}?`} effect="They are signed out of management on their next request. Their customer account is not affected. The last Owner cannot be removed." />
                        </>
                      ) : (
                        <ActionButton endpoint={EP} payload={{ action: "restore", user_id: m.user_id, version: m.version }} label="Restore access" confirmLabel="Restore" title={`Restore access for ${m.email}?`} effect="They keep their previous role and must complete the second step again." />
                      )}
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>
      <Panel title="Invite someone">
        <InviteForm />
      </Panel>
      <Panel title="Invitations">
        {!d.ok ? <LoadError what="invitations" /> : d.data.invites.length === 0 ? <Empty title="No invitations">Invitations appear here until they are used or expire.</Empty> : (
          <DataTable label="Invitations" head={["Email", "Role", "Status", "Expires", ""]}>
            {d.data.invites.map((i) => {
              const state = i.accepted_at ? "Accepted" : i.revoked_at ? "Cancelled" : new Date(i.expires_at) < new Date() ? "Expired" : "Pending";
              return (
                <tr key={i.id}>
                  <Td>{i.email}</Td><Td>{ROLE_LABEL[i.role]}</Td><Td><Badge tone={state === "Pending" ? "warn" : state === "Accepted" ? "good" : "neutral"}>{state}</Badge></Td><Td>{lagos(i.expires_at)}</Td>
                  <Td>{state === "Pending" ? <ActionButton endpoint={EP} payload={{ action: "revoke_invite", id: i.id }} label="Cancel" variant="ghost" confirmLabel="Cancel invitation" title={`Cancel the invitation for ${i.email}?`} effect="The link stops working immediately." /> : null}</Td>
                </tr>
              );
            })}
          </DataTable>
        )}
      </Panel>
      <Panel title="Permission matrix">
        <p className="mb-3 text-sm text-muted">What each role can do on the server. Extra permissions add to a role; they never apply to Owners (who already have everything).</p>
        <DataTable label="Permission matrix" head={["Permission", ...ROLES.map((r) => ROLE_LABEL[r])]}>
          {CAPS.map((c) => (
            <tr key={c}>
              <Td>{CAP_LABEL[c]}</Td>
              {ROLES.map((r) => (<Td key={r}>{capsFor(r).has(c) ? <span aria-label="Allowed">Yes</span> : <span className="text-muted" aria-label="Not allowed">No</span>}</Td>))}
            </tr>
          ))}
        </DataTable>
      </Panel>
    </>
  );
}
