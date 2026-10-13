import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import SignOut from "@/components/SignOut";
import { LinkButton } from "@/components/ui/Button";
import { PLANS } from "@/lib/plans";
import { getSession, supabaseServer } from "@/lib/supabase";

export const metadata: Metadata = { title: "Account" };

async function Details() {
  const { userId, plan } = await getSession();
  if (!userId) redirect("/login?next=%2Faccount");
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  const providers = (user?.app_metadata?.providers as string[] | undefined) ?? [user?.app_metadata?.provider as string | undefined].filter(Boolean);
  const hasPassword = providers.includes("email");
  return (
    <>
      <dl className="mb-8 grid max-w-[560px] gap-5 rounded-panel bg-surface p-6">
        <div>
          <dt className="text-sm text-muted">Email</dt>
          <dd className="break-all font-medium">{user?.email}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Sign-in method</dt>
          <dd className="font-medium">{providers.length ? providers.map((p) => (p === "google" ? "Google" : p === "email" ? "Email and password" : p)).join(", ") : "Not available"}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Plan</dt>
          <dd className="font-medium">{PLANS[plan].name}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center gap-3">
        <LinkButton variant="secondary" href="/billing">Billing</LinkButton>
        {hasPassword ? <Link href="/forgot-password" className="inline-flex min-h-12 items-center text-brand underline">Reset password</Link> : null}
        <SignOut />
      </div>
      <p className="mt-6 max-w-[560px] text-[13px] text-muted">
        If your plan ends, your saved codes stay in My codes. Free limits apply to new saves and gated downloads. Printed static codes do not change.
      </p>
    </>
  );
}

export default function Account() {
  return (
    <div className="mx-auto max-w-[760px] px-5 py-8 sm:px-10 sm:py-10 min-[1000px]:mx-0">
      <h1 className="mb-8 text-[28px] font-semibold leading-tight tracking-[-0.9px] sm:text-[40px]">Account</h1>
      <Suspense fallback={<div className="h-40 max-w-[560px] rounded-panel bg-disabled" aria-busy="true" />}>
        <Details />
      </Suspense>
    </div>
  );
}
