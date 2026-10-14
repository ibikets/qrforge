import { revalidateTag } from "next/cache";
import { CONTENT_TAG } from "@/lib/admin/consts";
import { adminActions, fail } from "@/lib/admin/guard";
import { int, must } from "@/lib/admin/validate";
import { validateLanding } from "@/lib/content";
import { adm as supabaseAdmin } from "@/lib/admin/db";

export const POST = adminActions({
  save_draft: {
    cap: "content.draft",
    limit: 120,
    reason: false,
    async handler({ staff, body }) {
      const v = validateLanding(body.data);
      if (!v.ok) throw fail(422, v.error, v.field);
      const expected = int(body, "version", { min: 0, max: 1_000_000 })!;
      const version = must(await supabaseAdmin().rpc("save_content_draft", { p_page: "landing", p_expected: expected, p_data: v.data, p_actor: staff.userId }));
      return { data: { version }, audit: { action: "content.draft_saved", targetType: "page", targetId: "landing", after: { version } } };
    },
  },
  restore_revision: {
    cap: "content.draft",
    async handler({ staff, body }) {
      const id = int(body, "revision", { min: 1, max: 2 ** 31 })!;
      const expected = int(body, "version", { min: 0, max: 1_000_000 })!;
      const db = supabaseAdmin();
      const rev = must(await db.from("content_revisions").select("data").eq("id", id).eq("page", "landing").maybeSingle());
      if (!rev) throw fail(404, "That revision was not found.");
      const v = validateLanding(rev.data);
      if (!v.ok) throw fail(422, "That revision no longer passes today’s content rules. Copy what you need into the draft by hand.");
      const version = must(await db.rpc("save_content_draft", { p_page: "landing", p_expected: expected, p_data: v.data, p_actor: staff.userId }));
      return { data: { version }, audit: { action: "content.revision_restored_as_draft", targetType: "page", targetId: "landing", after: { revision: id, version } } };
    },
  },
  publish: {
    cap: "content.publish",
    limit: 20,
    async handler({ staff, body }) {
      const expected = int(body, "version", { min: 1, max: 1_000_000 })!;
      const rev = must(await supabaseAdmin().rpc("publish_content", { p_page: "landing", p_expected: expected, p_actor: staff.userId }));
      revalidateTag(CONTENT_TAG, "max");
      return { data: { revision: rev }, audit: { action: "content.published", targetType: "page", targetId: "landing", after: { revision: rev } } };
    },
  },
  /** Asset uploads are not enabled: they need storage plus a vetted SVG/image sanitiser. */
  upload_asset: {
    cap: "media.manage",
    async handler() {
      throw fail(424, "Image uploads are not available yet. They need a storage bucket and a verified image and SVG sanitiser.");
    },
  },
});
