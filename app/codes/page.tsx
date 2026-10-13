import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import SavedCard from "@/components/SavedCard";
import type { SavedCode } from "@/components/Generator";
import { PLANS } from "@/lib/plans";
import { getSession, supabaseServer } from "@/lib/supabase";

export const metadata = { title: "My codes · QRForge" };

async function List() {
  const { userId, plan } = await getSession();
  if (!userId) redirect("/login?next=/codes");
  const sb = await supabaseServer();
  const { data } = await sb
    .from("qr_codes")
    .select("id,name,type,fields,style")
    .order("created_at", { ascending: false });
  const codes = (data ?? []) as SavedCode[];
  return (
    <>
      <p className="mt-1 text-sm text-neutral-600">
        {codes.length} of {PLANS[plan].maxSaved} saved ({PLANS[plan].name} plan).
      </p>
      {codes.length === 0 ? (
        <p className="mt-10 text-neutral-600">
          Nothing saved yet.{" "}
          <Link href="/" className="underline">
            Create your first code
          </Link>
        </p>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          {codes.map((c) => (
            <SavedCard key={c.id} code={c} />
          ))}
        </div>
      )}
    </>
  );
}

export default function Codes() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">My saved codes</h1>
      <Suspense fallback={<div className="mt-8 h-48 animate-pulse rounded-2xl bg-neutral-200" />}>
        <List />
      </Suspense>
    </main>
  );
}
