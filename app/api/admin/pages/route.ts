import { adm } from "@/lib/admin/db";
import { adminActions, fail } from "@/lib/admin/guard";
import { must, uuid } from "@/lib/admin/validate";
import { refreshPage } from "@/lib/pages/server";

/** Abuse takedown. Staff can disable or re-enable a page; they cannot read or edit its content. Reason and audit are mandatory. */
async function target(body: Record<string, unknown>) {
  const id = uuid(body, "page_id");
  const row = must(await adm().from("pages").select("id,public_id,lifecycle,taken_down_at").eq("id", id).maybeSingle());
  if (!row) throw fail(404, "That page was not found.");
  return row as { id: string; public_id: string; lifecycle: string; taken_down_at: string | null };
}

export const POST = adminActions({
  takedown: {
    cap: "pages.takedown",
    limit: 20,
    async handler({ body }) {
      const p = await target(body);
      if (p.taken_down_at) throw fail(409, "This page is already disabled.");
      must(await adm().from("pages").update({ taken_down_at: new Date().toISOString() }).eq("id", p.id).is("taken_down_at", null).select("id").single());
      refreshPage(p.public_id);
      return { audit: { action: "page.taken_down", targetType: "page", targetId: p.id, after: { public_id: p.public_id } } };
    },
  },
  restore: {
    cap: "pages.takedown",
    limit: 20,
    async handler({ body }) {
      const p = await target(body);
      if (!p.taken_down_at) throw fail(409, "This page is not disabled.");
      must(await adm().from("pages").update({ taken_down_at: null }).eq("id", p.id).select("id").single());
      refreshPage(p.public_id);
      return { audit: { action: "page.takedown_lifted", targetType: "page", targetId: p.id, after: { public_id: p.public_id } } };
    },
  },
});
