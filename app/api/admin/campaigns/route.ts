import { adm } from "@/lib/admin/db";
import { adminActions, fail } from "@/lib/admin/guard";
import { date, int, must, oneOf, str, stringList, uuid } from "@/lib/admin/validate";
import { hashOfferCode, normaliseOfferCode, OFFER_CODE_RE } from "@/lib/offers";

type Body = Record<string, unknown>;

async function floorPrice(plans: string[]): Promise<number> {
  const db = adm();
  let min = Infinity;
  for (const p of plans) {
    const row = must(await db.from("plan_versions").select("base_kobo").eq("plan", p).eq("state", "published").lte("effective_at", new Date().toISOString()).order("effective_at", { ascending: false }).limit(1).maybeSingle());
    if (!row) throw fail(409, `There is no published price for ${p} yet.`, "plans");
    min = Math.min(min, row.base_kobo as number);
  }
  return min;
}

/** Everything a campaign needs, validated on the server. A discount can never make a payment free or negative. */
async function parse(body: Body) {
  const name = str(body, "name", { max: 80, label: "Name" });
  const slug = str(body, "slug", { min: 2, max: 41, label: "Reference" }).toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(slug)) throw fail(422, "Use lower-case letters, numbers and hyphens.", "slug");
  const kind = oneOf(body, "discount_kind", ["percent", "fixed"] as const, "Discount type");
  const plans = stringList(body, "plans", ["pro", "business"]);
  if (!plans.length) throw fail(422, "Choose at least one plan.", "plans");
  const floor = await floorPrice(plans);
  let basis: number | null = null;
  let fixed: number | null = null;
  if (kind === "percent") {
    const p = Number(body.percent);
    if (!Number.isFinite(p) || p < 1 || p > 90) throw fail(422, "Enter a percentage from 1 to 90.", "percent");
    basis = Math.round(p * 100);
  } else {
    const n = int(body, "fixed_naira", { min: 1, max: 1_000_000, label: "Amount off" })!;
    fixed = n * 100;
    if (fixed >= floor) throw fail(422, "The amount off must be less than the plan price, so a payment is never free.", "fixed_naira");
  }
  const audience = oneOf(body, "audience", ["any", "new_paid"] as const, "Audience");
  const delivery = oneOf(body, "delivery", ["public", "private", "targeted"] as const, "Delivery");
  const startsAt = date(body, "starts_at");
  const endsAt = date(body, "ends_at");
  if (new Date(endsAt) <= new Date(startsAt)) throw fail(422, "The end must be after the start.", "ends_at");
  const total = int(body, "total_limit", { min: 1, max: 1_000_000, optional: true, label: "Total limit" });
  const per = int(body, "per_customer_limit", { min: 1, max: 10, label: "Per-customer limit" })!;
  const priority = int(body, "priority", { min: 0, max: 100, optional: true, label: "Priority" }) ?? 0;
  const banner = str(body, "banner_text", { max: 140, optional: true, label: "Notice" });
  if (/[<>]/.test(banner)) throw fail(422, "The notice is plain text only.", "banner_text");
  if (delivery !== "public" && banner) throw fail(422, "Only public offers show a notice on the website.", "banner_text");
  const internal = str(body, "internal_reason", { max: 500, optional: true, label: "Internal note" });

  let codeHash: string | null = null;
  const rawCode = typeof body.code === "string" ? normaliseOfferCode(body.code) : "";
  if (rawCode) {
    if (!OFFER_CODE_RE.test(rawCode)) throw fail(422, "Codes use 6 to 32 letters, numbers or hyphens.", "code");
    codeHash = hashOfferCode(rawCode);
  }
  if (delivery === "private" && !codeHash && body.keep_code !== true) throw fail(422, "A private offer needs a code.", "code");
  if (delivery === "public" && codeHash) throw fail(422, "Public offers apply automatically and do not use a code.", "code");
  return { name, slug, kind, plans, basis, fixed, audience, delivery, startsAt, endsAt, total, per, priority, banner, internal, codeHash, keepCode: body.keep_code === true };
}

async function targetsFor(body: Body): Promise<{ ids: string[]; missing: string[] }> {
  const raw = typeof body.target_emails === "string" ? body.target_emails : "";
  const emails = [...new Set(raw.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (emails.length > 200) throw fail(422, "Add at most 200 customers.", "target_emails");
  const ids: string[] = [];
  const missing: string[] = [];
  for (const e of emails) {
    const rows = must(await adm().rpc("list_customers", { p_q: e, p_status: null, p_limit: 5, p_offset: 0 })) as { user_id: string; email: string }[];
    const hit = rows.find((r) => r.email.toLowerCase() === e);
    if (hit) ids.push(hit.user_id);
    else missing.push(e);
  }
  return { ids, missing };
}

const dup = (e: unknown) => {
  const c = (e as { code?: string })?.code;
  if (c === "23505") return fail(409, "That reference or code is already in use.", "slug");
  return e;
};

export const POST = adminActions({
  save_draft: {
    cap: "campaigns.draft",
    async handler({ staff, body }) {
      const f = await parse(body);
      const db = adm();
      const id = typeof body.id === "string" && body.id ? uuid(body, "id") : null;
      const t = f.delivery === "targeted" ? await targetsFor(body) : { ids: [], missing: [] };
      if (f.delivery === "targeted" && !t.ids.length) throw fail(422, "None of those emails match a customer.", "target_emails");
      const row: Record<string, unknown> = {
        slug: f.slug, name: f.name, internal_reason: f.internal || null, discount_kind: f.kind, basis_points: f.basis, fixed_kobo: f.fixed,
        plans: f.plans, audience: f.audience, delivery: f.delivery, banner_text: f.banner || null, starts_at: f.startsAt, ends_at: f.endsAt,
        total_limit: f.total, per_customer_limit: f.per, priority: f.priority, updated_at: new Date().toISOString(),
      };
      if (f.codeHash) row.code_hash = f.codeHash;
      else if (f.delivery === "public") row.code_hash = null;
      let cid = id;
      try {
        if (!id) {
          const r = must(await db.from("campaigns").insert({ ...row, created_by: staff.userId }).select("id").single());
          cid = r.id;
        } else {
          const expected = int(body, "version", { min: 1, max: 1_000_000 })!;
          const cur = must(await db.from("campaigns").select("state").eq("id", id).maybeSingle());
          if (!cur) throw fail(404, "That offer was not found.");
          if (!["draft", "paused"].includes(cur.state)) throw fail(409, "Pause an active offer before editing it.");
          const r = must(await db.from("campaigns").update(row).eq("id", id).eq("version", expected).select("id").maybeSingle());
          if (!r) throw fail(409, "This was changed by someone else since you opened it. Reload to see the latest version.");
        }
      } catch (e) {
        throw dup(e);
      }
      await db.from("campaign_targets").delete().eq("campaign_id", cid);
      if (t.ids.length) must(await db.from("campaign_targets").insert(t.ids.map((u) => ({ campaign_id: cid, user_id: u }))));
      return { status: id ? 200 : 201, data: { id: cid, unmatched: t.missing }, audit: { action: id ? "campaign.draft_saved" : "campaign.draft_created", targetType: "campaign", targetId: cid ?? undefined, after: { slug: f.slug, kind: f.kind, plans: f.plans, delivery: f.delivery, starts_at: f.startsAt, ends_at: f.endsAt } } };
    },
  },
  /** Financial effect: a separate, step-up-protected permission. Writes an immutable version that quotes and payments reference. */
  publish: {
    cap: "campaigns.publish",
    limit: 20,
    async handler({ staff, body }) {
      const id = uuid(body, "id");
      const expected = int(body, "version", { min: 1, max: 1_000_000 })!;
      const db = adm();
      const c = must(await db.from("campaigns").select("*").eq("id", id).maybeSingle());
      if (!c) throw fail(404, "That offer was not found.");
      if (c.version !== expected) throw fail(409, "This was changed by someone else since you opened it. Reload to see the latest version.");
      if (!["draft", "paused"].includes(c.state)) throw fail(409, "Only a draft or paused offer can be published.");
      if (new Date(c.ends_at) <= new Date()) throw fail(422, "This offer has already ended. Change its dates first.");
      const floor = await floorPrice(c.plans);
      if (c.discount_kind === "fixed" && c.fixed_kobo >= floor) throw fail(422, "The amount off is no longer below the plan price.");
      const last = must(await db.from("campaign_versions").select("version").eq("campaign_id", id).order("version", { ascending: false }).limit(1).maybeSingle());
      const next = Math.max(c.version, (last?.version ?? 0) + 1);
      const { code_hash: _omit, ...snapshot } = c; // eslint-disable-line @typescript-eslint/no-unused-vars
      must(await db.from("campaign_versions").insert({ campaign_id: id, version: next, snapshot, published_by: staff.userId }).select("version").single());
      const r = must(await db.from("campaigns").update({ state: "active", version: next, published_by: staff.userId, updated_at: new Date().toISOString() }).eq("id", id).eq("version", expected).select("id").maybeSingle());
      if (!r) throw fail(409, "This was changed by someone else since you opened it. Reload to see the latest version.");
      return { audit: { action: "campaign.published", targetType: "campaign", targetId: id, after: { version: next, slug: c.slug } } };
    },
  },
  pause: {
    cap: "campaigns.publish",
    async handler({ body }) {
      const id = uuid(body, "id");
      const r = must(await adm().from("campaigns").update({ state: "paused", updated_at: new Date().toISOString() }).eq("id", id).in("state", ["active", "scheduled"]).select("slug").maybeSingle());
      if (!r) throw fail(409, "Only a live offer can be paused.");
      return { audit: { action: "campaign.paused", targetType: "campaign", targetId: id, after: { slug: r.slug } } };
    },
  },
  archive: {
    cap: "campaigns.publish",
    async handler({ body }) {
      const id = uuid(body, "id");
      const r = must(await adm().from("campaigns").update({ state: "archived", updated_at: new Date().toISOString() }).eq("id", id).neq("state", "archived").select("slug").maybeSingle());
      if (!r) throw fail(409, "That offer is already archived.");
      return { audit: { action: "campaign.archived", targetType: "campaign", targetId: id, after: { slug: r.slug } } };
    },
  },
});
