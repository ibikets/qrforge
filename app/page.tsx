import { Suspense } from "react";
import Generator, { type SavedCode } from "@/components/Generator";
import { getSession, supabaseServer } from "@/lib/supabase";

async function GeneratorWithPlan({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { plan, userId } = await getSession();
  const sp = await searchParams;
  const loadId = typeof sp.load === "string" ? sp.load : undefined;

  let initial: SavedCode | undefined;
  if (userId && loadId) {
    const sb = await supabaseServer();
    const { data } = await sb.from("qr_codes").select("id,name,type,fields,style").eq("id", loadId).maybeSingle();
    if (data) initial = data as SavedCode;
  }
  return <Generator key={initial?.id ?? "new"} plan={plan} signedIn={Boolean(userId)} initial={initial} />;
}

export default function Home(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Create a QR code in seconds</h1>
      <p className="mt-2 mb-8 max-w-xl text-neutral-600">
        Links, WiFi, WhatsApp, contacts and more. Style it, add your logo, and download in the format you need.
      </p>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-neutral-200" />}>
        <GeneratorWithPlan searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
