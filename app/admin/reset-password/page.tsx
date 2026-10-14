import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import AuthShell from "@/components/AuthShell";
import StaffResetForm from "@/components/admin/StaffResetForm";
import { staffServer } from "@/lib/staff-server";
import { supabaseConfigured } from "@/lib/supabase";

export const metadata: Metadata = { title: "Set staff password" };

async function Body({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const expired = (): React.ReactNode => (
    <>
      <p className="mb-4 text-muted">This link has expired or was opened in a different browser. Ask for a new one and open it in the browser you requested it from.</p>
      <Link href="/admin/login/forgot" className="font-medium text-brand">Ask for a new link</Link>
    </>
  );
  if (sp.state === "expired" || !supabaseConfigured) return expired();
  const sb = await staffServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return expired();
  return <StaffResetForm />;
}

export default function StaffReset(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <AuthShell title="Set your staff password">
      <Suspense fallback={<p className="text-muted" role="status">Checking your link…</p>}>
        <Body searchParams={props.searchParams} />
      </Suspense>
    </AuthShell>
  );
}
