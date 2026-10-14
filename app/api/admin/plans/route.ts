import { adminActions, fail } from "@/lib/admin/guard";
import { date, int, must, oneOf, str, uuid } from "@/lib/admin/validate";
import { adm as supabaseAdmin } from "@/lib/admin/db";
import { revalidateTag } from "next/cache";
import { PLAN_TAG } from "@/lib/admin/consts";

export const POST = adminActions({
  /** A new draft version. Prices are whole naira (stored as kobo). Existing subscribers keep the renewal price they agreed to. */
  create_draft: {
    cap: "plans.draft",
    async handler({ staff, body }) {
      const plan = oneOf(body, "plan", ["pro", "business"] as const, "Plan");
      const naira = int(body, "price_naira", { min: 100, max: 1_000_000, label: "Price" })!;
      const note = str(body, "note", { max: 200, optional: true, label: "Note" });
      const db = supabaseAdmin();
      const latest = must(await db.from("plan_versions").select("version").eq("plan", plan).order("version", { ascending: false }).limit(1).maybeSingle());
      const row = must(await db.from("plan_versions").insert({ plan, version: (latest?.version ?? 0) + 1, base_kobo: naira * 100, period_days: 30, display: note ? { note } : {}, created_by: staff.userId }).select("id,version").single());
      return { status: 201, data: { id: row.id }, audit: { action: "plan.draft_created", targetType: "plan_version", targetId: row.id, after: { plan, version: row.version, base_kobo: naira * 100 } } };
    },
  },
  discard_draft: {
    cap: "plans.draft",
    async handler({ body }) {
      const id = uuid(body, "id");
      const row = must(await supabaseAdmin().from("plan_versions").delete().eq("id", id).eq("state", "draft").select("id").maybeSingle());
      if (!row) throw fail(409, "Only drafts can be discarded.");
      return { audit: { action: "plan.draft_discarded", targetType: "plan_version", targetId: id } };
    },
  },
  /** Publishing is a separate, step-up-protected permission. New purchases only; the database makes a published version immutable. */
  publish: {
    cap: "plans.publish",
    limit: 20,
    async handler({ staff, body }) {
      const id = uuid(body, "id");
      const at = body.effective_at ? date(body, "effective_at") : new Date().toISOString();
      if (new Date(at).getTime() < Date.now() - 60_000) throw fail(422, "Choose a time that is not in the past.", "effective_at");
      const row = must(await supabaseAdmin().from("plan_versions").update({ state: "published", effective_at: at, published_by: staff.userId }).eq("id", id).eq("state", "draft").select("plan,version,base_kobo").maybeSingle());
      if (!row) throw fail(409, "Only a draft can be published.");
      revalidateTag(PLAN_TAG, "max");
      return { audit: { action: "plan.published", targetType: "plan_version", targetId: id, after: { ...row, effective_at: at } } };
    },
  },
  archive: {
    cap: "plans.publish",
    async handler({ body }) {
      const id = uuid(body, "id");
      const db = supabaseAdmin();
      const row = must(await db.from("plan_versions").select("plan,state,effective_at").eq("id", id).maybeSingle());
      if (!row || row.state !== "published") throw fail(409, "Only a published version can be archived.");
      const newer = must(await db.from("plan_versions").select("id").eq("plan", row.plan).eq("state", "published").lte("effective_at", new Date().toISOString()).neq("id", id).limit(1).maybeSingle());
      if (!newer) throw fail(409, "A plan must keep one published price. Publish another version first.");
      must(await db.from("plan_versions").update({ state: "archived" }).eq("id", id).select("id").single());
      revalidateTag(PLAN_TAG, "max");
      return { audit: { action: "plan.archived", targetType: "plan_version", targetId: id } };
    },
  },
});
