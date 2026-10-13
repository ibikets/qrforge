import type { Metadata } from "next";
import { Suspense } from "react";
import AuthShell from "@/components/AuthShell";
import ResetForm from "@/components/ResetForm";

export const metadata: Metadata = { title: "Choose a new password" };

async function Form({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return <ResetForm expiredHint={sp.state === "expired"} />;
}

export default function ResetPassword(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <AuthShell title="Choose a new password">
      <Suspense fallback={<p className="text-muted">Checking your link…</p>}>
        <Form searchParams={props.searchParams} />
      </Suspense>
    </AuthShell>
  );
}
