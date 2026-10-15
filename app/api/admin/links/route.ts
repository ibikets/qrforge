import { adm } from "@/lib/admin/db";
import { adminActions, fail } from "@/lib/admin/guard";
import { must, uuid } from "@/lib/admin/validate";

/** Abuse takedown for dynamic links. Same permission, reason and audit rules as hosted pages. The redirect reads the row on every request, so the effect is immediate. */
async function target(body: Record<string, unknown>) {
  const id = uuid(body, "link_id");
  const row = must(await adm().from("links").select("id,slug,destination,taken_down_at,deleted_at").eq("id", id).maybeSingle());
  if (!row) throw fail(404, "That link was not found.");
  return row as { id: string; slug: string; destination: string; taken_down_at: string | null; deleted_at: string | null };
}
const host = (u: string) => { try { return new URL(u).host; } catch { return "unknown"; } };

export const POST = adminActions({
  takedown: {
    cap: "pages.takedown",
    limit: 20,
    async handler({ body }) {
      const l = await target(body);
      if (l.deleted_at) throw fail(409, "This link was already deleted by its owner.");
      if (l.taken_down_at) throw fail(409, "This link is already disabled.");
      must(await adm().from("links").update({ taken_down_at: new Date().toISOString() }).eq("id", l.id).is("taken_down_at", null).select("id").single());
      return { audit: { action: "link.taken_down", targetType: "link", targetId: l.id, after: { slug: l.slug, destination_host: host(l.destination) } } };
    },
  },
  restore: {
    cap: "pages.takedown",
    limit: 20,
    async handler({ body }) {
      const l = await target(body);
      if (!l.taken_down_at) throw fail(409, "This link is not disabled.");
      must(await adm().from("links").update({ taken_down_at: null }).eq("id", l.id).select("id").single());
      return { audit: { action: "link.takedown_lifted", targetType: "link", targetId: l.id, after: { slug: l.slug, destination_host: host(l.destination) } } };
    },
  },
});
