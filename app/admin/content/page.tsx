import { Blocked, DataTable, Denied, Empty, LoadError, PageHead, Panel, Td, lagos } from "@/components/admin/kit";
import ContentEditor from "@/components/admin/ContentEditor";
import { ActionButton } from "@/components/admin/Mutation";
import { currentStaff } from "@/lib/admin/guard";
import { adm, load, q } from "@/lib/admin/read";
import { DEFAULT_LANDING, validateLanding, type Landing } from "@/lib/content";

type Rev = { id: number; created_at: string; data: unknown; author_id: string | null; published_by: string | null };

export default async function Content() {
  const s = await currentStaff();
  if (s.status !== "ok" || !s.staff.caps.has("content.draft")) return <Denied />;
  const { caps } = s.staff;
  const state = await load(async () => {
    const db = adm();
    const [draft, pub, revs] = await Promise.all([
      db.from("content_drafts").select("data,version,updated_at").eq("page", "landing").maybeSingle(),
      db.from("content_published").select("revision_id,published_at").eq("page", "landing").maybeSingle(),
      db.from("content_revisions").select("id,created_at,data,author_id,published_by").eq("page", "landing").order("id", { ascending: false }).limit(15),
    ]);
    const published = q(pub) as { revision_id: number; published_at: string } | null;
    return { draft: q(draft) as { data: unknown; version: number; updated_at: string } | null, published, revs: q(revs) as Rev[] };
  });

  if (!state.ok) return (<><PageHead title="Landing content" /><LoadError what="the landing content" /></>);
  const { draft, published, revs } = state.data;
  const live = published ? revs.find((r) => r.id === published.revision_id) : undefined;
  const liveParsed = live ? validateLanding(live.data) : null;
  const draftParsed = draft ? validateLanding(draft.data) : null;
  const initial: Landing = draftParsed?.ok ? draftParsed.data : liveParsed?.ok ? liveParsed.data : DEFAULT_LANDING;
  const version = draft?.version ?? 0;
  const same = Boolean(draftParsed?.ok && liveParsed?.ok && JSON.stringify(draftParsed.data) === JSON.stringify(liveParsed.data));
  const canPublish = caps.has("content.publish");

  return (
    <>
      <PageHead
        title="Landing content"
        lead={published ? `Live version published ${lagos(published.published_at)}. Draft changes are not live.` : "Nothing has been published yet, so the website shows the built-in text. Draft changes are not live."}
      />
      <ContentEditor initial={initial} version={version} canPublish={canPublish} publishedSame={same} />

      <div className="mt-10" />
      <Panel title="History">
        {revs.length === 0 ? (
          <Empty title="No published versions yet">Each publish is kept here. Restoring one copies it into the draft; it does not go live until you publish.</Empty>
        ) : (
          <DataTable label="Published versions" head={["Version", "Published", "Status", ""]}>
            {revs.map((r) => (
              <tr key={r.id}>
                <Td>#{r.id}</Td>
                <Td>{lagos(r.created_at)}</Td>
                <Td>{published?.revision_id === r.id ? "Live" : "Earlier"}</Td>
                <Td>
                  <ActionButton endpoint="/api/admin/content" payload={{ action: "restore_revision", revision: r.id, version }} label={`Restore #${r.id} as draft`} title={`Restore version #${r.id} as the draft?`} effect={<>This replaces the current draft with version #{r.id}. It is not live until you publish. Unsaved edits on this page are not included.</>} confirmLabel="Restore as draft" />
                </Td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>

      <Panel title="Images">
        <Blocked title="Image library" dependency="A storage bucket for uploads and a verified image and SVG sanitiser (strips scripts, checks type, size and alt text). Until then the landing page uses no uploaded images, so nothing is published without being checked." />
      </Panel>
    </>
  );
}
