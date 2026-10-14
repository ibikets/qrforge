import { revalidateTag } from "next/cache";
import { CONTENT_TAG } from "@/lib/admin/consts";
import { adminActions, fail } from "@/lib/admin/guard";
import { int, must, uuid } from "@/lib/admin/validate";
import { validateLanding } from "@/lib/content";
import { adm as supabaseAdmin } from "@/lib/admin/db";

export const POST = adminActions({
  save_draft: {
    cap: "content.draft",
    limit: 120,
    reason: false,
    async handler({ staff, body }) {
      const data = await withServerImage(body.data);
      const v = validateLanding(data);
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
  /** Images are never deleted: archiving hides one from the picker, and is refused while the draft or live page still uses it. */
  archive_asset: {
    cap: "media.manage",
    async handler({ body }) {
      const id = uuid(body, "asset");
      const db = supabaseAdmin();
      const a = must(await db.from("content_assets").select("id,state,path").eq("id", id).maybeSingle());
      if (!a) throw fail(404, "That image was not found.");
      if (a.state === "archived") return { data: { already: true } };
      const [draft, pub] = await Promise.all([
        db.from("content_drafts").select("data").eq("page", "landing").maybeSingle(),
        db.from("content_published").select("revision_id").eq("page", "landing").maybeSingle(),
      ]);
      let live: unknown = null;
      const pubRow = must(pub) as { revision_id: number } | null;
      if (pubRow) live = must(await db.from("content_revisions").select("data").eq("id", pubRow.revision_id).maybeSingle())?.data;
      const uses = (d: unknown) => (d as { hero?: { image?: { assetId?: string } | null } } | null)?.hero?.image?.assetId === id;
      if (uses((must(draft) as { data: unknown } | null)?.data) || uses(live)) throw fail(409, "This image is used by the draft or the live page. Choose a different image there first, then archive it.");
      must(await db.from("content_assets").update({ state: "archived" }).eq("id", id).select("id").single());
      revalidateTag(CONTENT_TAG, "max");
      return { data: { archived: true }, audit: { action: "asset.archived", targetType: "asset", targetId: id, before: { state: "active" }, after: { state: "archived" } } };
    },
  },
});

/** The browser names an image; the server fills in its stored path, size and description from its own record. */
async function withServerImage(raw: unknown): Promise<unknown> {
  const d = raw as { hero?: { image?: { assetId?: unknown } | null } } | null;
  const ref = d?.hero?.image;
  if (!d || ref == null) {
    if (d?.hero && "image" in d.hero) delete d.hero.image;
    return d;
  }
  if (typeof ref.assetId !== "string") throw fail(422, "Choose an image from the library.", "hero.image");
  const a = must(await supabaseAdmin().from("content_assets").select("id,path,alt,width,height,state").eq("id", ref.assetId).maybeSingle());
  if (!a || a.state !== "active") throw fail(422, "That image is not available. Choose another from the library.", "hero.image");
  d.hero!.image = { assetId: a.id, path: a.path, alt: a.alt, width: a.width, height: a.height } as never;
  return d;
}
