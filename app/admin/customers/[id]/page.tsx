import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, DataTable, Denied, Empty, KV, LoadError, PageHead, Panel, Td, kobo, lagos, linkCls } from "@/components/admin/kit";
import { ActionButton, EditorForm } from "@/components/admin/Mutation";
import { currentStaff } from "@/lib/admin/guard";
import { adm, load, q } from "@/lib/admin/read";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EP = "/api/admin/customers";

export default async function Customer({ params }: { params: Promise<{ id: string }> }) {
  const s = await currentStaff();
  if (s.status !== "ok") return <Denied />;
  const { caps } = s.staff;
  const full = caps.has("customers.read");
  if (!full && !caps.has("customers.read_minimal")) return <Denied />;
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const base = await load(async () => {
    const db = adm();
    const u = await db.auth.admin.getUserById(id);
    if (u.error || !u.data.user) return null;
    const [sub, profile, staff] = await Promise.all([
      db.from("subscriptions").select("plan,current_period_end,auto_renew,renewal_kobo,failed_attempts").eq("user_id", id).maybeSingle(),
      db.from("customer_profiles").select("*").eq("user_id", id).maybeSingle(),
      db.from("staff_members").select("user_id").eq("user_id", id).maybeSingle(),
    ]);
    return { user: u.data.user, sub: q(sub), profile: q(profile), isStaff: Boolean(q(staff)) };
  });
  if (!base.ok) return (<><PageHead title="Customer" /><LoadError what="this customer" /></>);
  if (!base.data) notFound();
  const { user, sub, profile, isStaff } = base.data;

  const pays = caps.has("payments.read") || caps.has("payments.read_summary")
    ? await load(async () => q(await adm().from("payments").select("reference,plan,amount_kobo,base_kobo,discount_kobo,status,created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(20)) as { reference: string; plan: string; amount_kobo: number; base_kobo: number | null; discount_kobo: number; status: string; created_at: string }[])
    : null;
  const notes = full ? await load(async () => q(await adm().from("customer_notes").select("id,body,created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(20)) as { id: string; body: string; created_at: string }[]) : null;
  const tickets = caps.has("support.manage") ? await load(async () => q(await adm().from("support_tickets").select("id,subject,state,created_at").eq("customer_id", id).order("created_at", { ascending: false }).limit(10)) as { id: string; subject: string; state: string; created_at: string }[]) : null;

  const active = sub && new Date(sub.current_period_end) > new Date();
  const suspended = (profile?.status === "suspended") || Boolean((user as { banned_until?: string }).banned_until && new Date((user as { banned_until?: string }).banned_until!) > new Date());
  const manage = !isStaff;

  return (
    <>
      <PageHead
        title={user.email ?? "Customer"}
        lead={isStaff ? "This is a staff account. Manage it in Staff." : undefined}
        actions={<Link href="/admin/customers" className={linkCls}>All customers</Link>}
      />
      <Panel title="Account" aside={<Badge tone={suspended ? "bad" : "good"}>{suspended ? "Suspended" : "Active"}</Badge>}>
        <KV
          items={[
            ["Sign-in email", user.email],
            ...(full ? ([["Display name", profile?.display_name ?? "–"], ["Contact email", profile?.contact_email ?? "–"]] as [string, string][]) : []),
            ["Joined", lagos(user.created_at)],
            ["Last sign-in", lagos(user.last_sign_in_at)],
            ["Plan", active ? `${sub.plan === "pro" ? "Pro" : "Business"} until ${lagos(sub.current_period_end)}` : "Free"],
            ...(active ? ([["Auto-renew", sub.auto_renew ? "On" : "Off"], ["Renewal price", kobo(sub.renewal_kobo)]] as [string, string][]) : []),
            ...(suspended && profile?.status_reason ? ([["Suspension reason", profile.status_reason]] as [string, string][]) : []),
          ]}
        />
        <p className="mt-4 text-[13px] text-muted">The sign-in email changes only through the customer’s own verified flow. The contact email below is separate.</p>
      </Panel>

      {full && caps.has("customers.update") && manage ? (
        <Panel title="Edit profile">
          <EditorForm
            endpoint={EP}
            extra={{ action: "update_profile", user_id: id, version: profile?.version ?? 0 }}
            initial={{ display_name: profile?.display_name ?? "", contact_email: profile?.contact_email ?? "" }}
            fields={[
              { name: "display_name", label: "Display name", maxLength: 120 },
              { name: "contact_email", label: "Contact email", type: "email", maxLength: 254, help: "For contact only. It does not change how the customer signs in." },
            ]}
            submitLabel="Save profile"
          />
        </Panel>
      ) : null}

      {manage && (caps.has("customers.suspend") || caps.has("customers.reset_link")) ? (
        <Panel title="Access">
          <div className="flex flex-wrap gap-3">
            {caps.has("customers.suspend") ? (
              suspended ? (
                <ActionButton endpoint={EP} payload={{ action: "unsuspend", user_id: id }} label="Lift suspension" title="Lift this suspension?" effect={<>Lets <strong>{user.email}</strong> sign in again. Renewal and refunds are not changed by this.</>} />
              ) : (
                <ActionButton endpoint={EP} payload={{ action: "suspend", user_id: id }} label="Suspend account" variant="danger" confirmLabel="Suspend" title="Suspend this account?" effect={<>This blocks <strong>{user.email}</strong> from signing in. Renewal and refunds are separate actions and are not changed. Saved codes and any paid plan are kept.</>} />
              )
            ) : null}
            {caps.has("customers.reset_link") ? (
              <ActionButton endpoint={EP} payload={{ action: "send_reset", user_id: id }} label="Send password-reset email" title="Send a password-reset email?" effect={<>An email goes to <strong>{user.email}</strong> only. You will not see the link, and the customer’s password is never shown.</>} confirmLabel="Send email" />
            ) : null}
          </div>
        </Panel>
      ) : null}

      {manage && caps.has("entitlement.adjust") ? (
        <Panel title="Adjust plan time">
          <p className="mb-4 text-sm text-muted">Adds days to an existing paid plan{s.staff.role === "owner" ? " or changes its tier" : " (up to 30 days)"}. This is recorded as an adjustment, never as a payment.</p>
          <EditorForm
            endpoint={EP}
            extra={{ action: "adjust_entitlement", user_id: id, kind: "extend_days" }}
            initial={{ days: 7 }}
            fields={[{ name: "days", label: "Days to add", type: "number", min: 1, max: s.staff.role === "owner" ? 90 : 30, required: true }]}
            submitLabel="Add days"
            disabledReason={active ? undefined : "This customer has no active paid plan."}
          />
          {s.staff.role === "owner" && active ? (
            <div className="mt-6 border-t border-divider pt-4">
              <EditorForm
                endpoint={EP}
                extra={{ action: "adjust_entitlement", user_id: id, kind: "set_plan" }}
                initial={{ plan: sub.plan }}
                fields={[{ name: "plan", label: "Move to plan", type: "select", options: [{ value: "pro", label: "Pro" }, { value: "business", label: "Business" }] }]}
                submitLabel="Change plan"
              />
            </div>
          ) : null}
        </Panel>
      ) : null}

      {pays ? (
        <Panel title="Payments">
          {!pays.ok ? <LoadError what="payments" /> : pays.data.length === 0 ? <Empty title="No payments">This customer has not paid.</Empty> : (
            <DataTable label="Payments" head={["Date", "Plan", "Paid", "Discount", "Status", ...(caps.has("payments.read") ? ["Reference"] : [])]}>
              {pays.data.map((p) => (
                <tr key={p.reference}>
                  <Td>{lagos(p.created_at)}</Td>
                  <Td>{p.plan}</Td>
                  <Td>{kobo(p.amount_kobo)}</Td>
                  <Td>{p.discount_kobo ? kobo(p.discount_kobo) : "–"}</Td>
                  <Td><Badge tone={p.status === "success" ? "good" : "warn"}>{p.status === "success" ? "Confirmed" : p.status}</Badge></Td>
                  {caps.has("payments.read") ? <Td><Link href={`/admin/payments/${encodeURIComponent(p.reference)}`} className={linkCls}>{p.reference.slice(0, 14)}…</Link></Td> : null}
                </tr>
              ))}
            </DataTable>
          )}
        </Panel>
      ) : null}

      {tickets ? (
        <Panel title="Support history">
          {!tickets.ok ? <LoadError what="tickets" /> : tickets.data.length === 0 ? <Empty title="No tickets" /> : (
            <ul className="m-0 grid list-none gap-2 p-0">
              {tickets.data.map((t) => (<li key={t.id}><Link href={`/admin/support/${t.id}`} className={linkCls}>{t.subject}</Link> <span className="text-sm text-muted">· {t.state} · {lagos(t.created_at)}</span></li>))}
            </ul>
          )}
        </Panel>
      ) : null}

      {notes ? (
        <Panel title="Internal notes" aside={<span className="text-[13px] text-muted">Never shown to the customer</span>}>
          {manage && caps.has("customers.update") ? (
            <div className="mb-6">
              <EditorForm endpoint={EP} extra={{ action: "add_note", user_id: id }} fields={[{ name: "note", label: "Add a note", type: "textarea", maxLength: 2000, required: true, rows: 3 }]} submitLabel="Add note" resetOnDone reason={false} />
            </div>
          ) : null}
          {!notes.ok ? <LoadError what="notes" /> : notes.data.length === 0 ? <Empty title="No notes yet" /> : (
            <ul className="m-0 grid list-none gap-3 p-0">
              {notes.data.map((n) => (<li key={n.id} className="border-b border-divider pb-3"><p className="whitespace-pre-wrap">{n.body}</p><p className="mt-1 text-[13px] text-muted">{lagos(n.created_at)}</p></li>))}
            </ul>
          )}
        </Panel>
      ) : null}
    </>
  );
}
