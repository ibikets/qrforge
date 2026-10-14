import Link from "next/link";
import {
  Badge,
  DataTable,
  Denied,
  Empty,
  LoadError,
  Notice,
  PageHead,
  Panel,
  Td,
  kobo,
  lagos,
  linkCls,
} from "@/components/admin/kit";
import { ActionButton, EditorForm } from "@/components/admin/Mutation";
import { currentStaff } from "@/lib/admin/guard";
import { adm, load, q } from "@/lib/admin/read";
import { PLANS } from "@/lib/plans";

type V = {
  id: string;
  plan: "pro" | "business";
  version: number;
  base_kobo: number;
  state: string;
  effective_at: string | null;
  display: { note?: string };
  created_at: string;
};
const EP = "/api/admin/plans";

const nowMs = () => Date.now(); // read per request (this page is dynamic)

export default async function Plans() {
  const s = await currentStaff();
  if (
    s.status !== "ok" ||
    !(["plans.draft", "plans.publish", "entitlement.adjust"] as const).some(
      (c) => s.staff.caps.has(c),
    )
  )
    return <Denied />;
  const { caps } = s.staff;
  const rows = await load(
    async () =>
      q(
        await adm()
          .from("plan_versions")
          .select("*")
          .order("plan")
          .order("version", { ascending: false }),
      ) as V[],
  );
  const now = nowMs();
  const current = (plan: string) =>
    rows.ok
      ? rows.data
          .filter(
            (v) =>
              v.plan === plan &&
              v.state === "published" &&
              v.effective_at &&
              new Date(v.effective_at).getTime() <= now,
          )
          .sort(
            (a, b) =>
              new Date(b.effective_at!).getTime() -
                new Date(a.effective_at!).getTime() || b.version - a.version,
          )[0]
      : undefined;

  return (
    <>
      <PageHead
        title="Plans"
        lead="Price versions for new purchases. Existing subscribers keep the renewal price they agreed to."
      />
      <Notice>
        New purchases only. Existing subscriptions retain their agreed terms.
      </Notice>
      {!rows.ok ? (
        <LoadError what="plans" />
      ) : (
        <Panel title="Price versions">
          {rows.data.length === 0 ? (
            <Empty title="No price versions">
              Plans use the built-in prices until a version is published.
            </Empty>
          ) : (
            <DataTable
              label="Plan price versions"
              head={[
                "Plan",
                "Version",
                "Price / 30 days",
                "Status",
                "Effective",
                "",
              ]}
            >
              {rows.data.map((v) => {
                const isCurrent = current(v.plan)?.id === v.id;
                return (
                  <tr key={v.id}>
                    <Td>{PLANS[v.plan].name}</Td>
                    <Td>
                      v{v.version}
                      {v.display?.note ? (
                        <span className="block text-[13px] text-muted">
                          {v.display.note}
                        </span>
                      ) : null}
                    </Td>
                    <Td>{kobo(v.base_kobo)}</Td>
                    <Td>
                      <Badge
                        tone={
                          isCurrent
                            ? "good"
                            : v.state === "draft"
                              ? "warn"
                              : "neutral"
                        }
                      >
                        {isCurrent
                          ? "Current"
                          : v.state === "draft"
                            ? "Draft"
                            : v.state === "archived"
                              ? "Archived"
                              : "Published"}
                      </Badge>
                    </Td>
                    <Td>{lagos(v.effective_at)}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-2">
                        {v.state === "draft" && caps.has("plans.publish") ? (
                          <ActionButton
                            endpoint={EP}
                            payload={{ action: "publish", id: v.id }}
                            label={`Publish v${v.version}`}
                            variant="primary"
                            confirmLabel="Publish"
                            title={`Publish ${PLANS[v.plan].name} v${v.version}?`}
                            effect={
                              <>
                                New purchases of {PLANS[v.plan].name} will cost{" "}
                                <strong>{kobo(v.base_kobo)}</strong> for 30 days
                                from now. Existing subscribers keep their agreed
                                renewal price. A published version cannot be
                                edited.
                              </>
                            }
                          />
                        ) : null}
                        {v.state === "draft" && caps.has("plans.draft") ? (
                          <ActionButton
                            endpoint={EP}
                            payload={{ action: "discard_draft", id: v.id }}
                            label="Discard"
                            variant="ghost"
                            confirmLabel="Discard draft"
                            title="Discard this draft?"
                            effect="This draft is deleted. Nothing live changes."
                          />
                        ) : null}
                        {v.state === "published" &&
                        !isCurrent &&
                        caps.has("plans.publish") ? (
                          <ActionButton
                            endpoint={EP}
                            payload={{ action: "archive", id: v.id }}
                            label="Archive"
                            variant="ghost"
                            confirmLabel="Archive"
                            title="Archive this version?"
                            effect="It stays in history for past payments but can no longer be the current price."
                          />
                        ) : null}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </DataTable>
          )}
        </Panel>
      )}

      {caps.has("plans.draft") ? (
        <Panel title="New price version">
          <EditorForm
            endpoint={EP}
            extra={{ action: "create_draft" }}
            initial={{ plan: "pro", price_naira: PLANS.pro.priceNgn, note: "" }}
            fields={[
              {
                name: "plan",
                label: "Plan",
                type: "select",
                options: [
                  { value: "pro", label: "Pro" },
                  { value: "business", label: "Business" },
                ],
              },
              {
                name: "price_naira",
                label: "Price for 30 days (₦)",
                type: "number",
                min: 100,
                max: 1000000,
                required: true,
                help: "Whole naira. It is saved as a draft; nothing changes until it is published.",
              },
              { name: "note", label: "Internal note", maxLength: 200 },
            ]}
            submitLabel="Save draft"
            resetOnDone
          />
        </Panel>
      ) : null}

      <Panel title="What each plan includes">
        <p className="mb-3 text-sm text-muted">
          Limits are set in the application, so a screen here can never loosen
          an export limit. Changing them needs a code release.
        </p>
        <DataTable
          label="Plan entitlements"
          head={[
            "Plan",
            "Types",
            "Formats",
            "Largest size",
            "Saved codes",
            "Logo",
          ]}
        >
          {(["free", "pro", "business"] as const).map((id) => (
            <tr key={id}>
              <Td>{PLANS[id].name}</Td>
              <Td>
                {PLANS[id].types === "all"
                  ? "All types"
                  : "Website, text, email"}
              </Td>
              <Td>{PLANS[id].formats.join(", ").toUpperCase()}</Td>
              <Td>{PLANS[id].maxSize}px</Td>
              <Td>{PLANS[id].maxSaved.toLocaleString("en-US")}</Td>
              <Td>{PLANS[id].logo ? "Yes" : "No"}</Td>
            </tr>
          ))}
        </DataTable>
        <p className="mt-4 text-sm">
          Adding days or changing a tier for one customer is done on{" "}
          <Link href="/admin/customers" className={linkCls}>
            the customer’s page
          </Link>
          .
        </p>
      </Panel>
    </>
  );
}
