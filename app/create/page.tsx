import type { Metadata } from "next";
import { Suspense } from "react";
import Generator, { type SavedCode } from "@/components/Generator";
import { getSession, supabaseServer } from "@/lib/supabase";

export const metadata: Metadata = { title: "Create a QR code" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function Editor({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { plan, userId } = await getSession();
  const sp = await searchParams;
  const loadId = typeof sp.load === "string" ? sp.load : undefined;
  const draftId = typeof sp.draft === "string" && UUID.test(sp.draft) ? sp.draft : undefined;

  let initial: SavedCode | undefined;
  let loadProblem: "not-found" | "error" | null = null;
  let savedCount: number | null = null;
  if (userId) {
    const sb = await supabaseServer();
    const { count } = await sb.from("qr_codes").select("id", { count: "exact", head: true });
    savedCount = count ?? null;
    if (loadId) {
      if (!UUID.test(loadId)) loadProblem = "not-found";
      else {
        const { data, error } = await sb.from("qr_codes").select("id,name,type,fields,style").eq("id", loadId).maybeSingle();
        if (error) loadProblem = "error";
        else if (!data) loadProblem = "not-found";
        else initial = data as SavedCode;
      }
    }
  } else if (loadId) {
    loadProblem = "not-found";
  }
  return (
    <Generator
      key={initial?.id ?? draftId ?? "new"}
      plan={plan}
      signedIn={Boolean(userId)}
      initial={initial}
      draftId={draftId}
      savedCount={savedCount}
      loadProblem={loadProblem}
      justSaved={sp.saved === "1" && Boolean(initial)}
    />
  );
}

export default function CreatePage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-[1280px] px-5 py-10 sm:px-10" aria-busy="true"><div className="h-12 w-2/3 rounded-control bg-disabled" /><div className="mt-6 h-96 rounded-panel bg-disabled" /></div>}>
      <Editor searchParams={props.searchParams} />
    </Suspense>
  );
}
