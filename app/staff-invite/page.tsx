import type { Metadata } from "next";
import { Suspense } from "react";
import AcceptInvite from "@/components/admin/AcceptInvite";
import { LinkButton } from "@/components/ui/Button";
import { supabaseConfigured } from "@/lib/supabase";
import { claimsOf, hasPasswordLogin } from "@/lib/staff-auth";
import { staffServer } from "@/lib/staff-server";

export const metadata: Metadata = { title: "Staff invitation", robots: { index: false, follow: false } };

async function Body({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  if (token.length < 20 || token.length > 100) {
    return <p className="text-muted">This invitation link is not valid. Ask the Owner to send a new staff invitation.</p>;
  }
  if (!supabaseConfigured) return <p className="text-muted">Sign-in is not configured here.</p>;
  const sb = await staffServer();
  const { data: { user } } = await sb.auth.getUser();
  const { data: { session } } = await sb.auth.getSession();
  if (!user?.email || !hasPasswordLogin(claimsOf(session?.access_token).amr)) {
    return (
      <>
        <p className="mb-5 text-muted">Sign in to staff access with the email address this invitation was sent to, then come back to this link. If you have no password yet, use “Forgot password?” on the staff sign-in to set one.</p>
        <LinkButton href={`/admin/login?next=${encodeURIComponent(`/staff-invite?token=${token}`)}`}>Staff sign-in</LinkButton>
      </>
    );
  }
  return <AcceptInvite token={token} email={user.email} />;
}

export default function StaffInvite({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <div className="mx-auto my-16 max-w-[520px] px-5">
      <h1 className="mb-3 text-[28px] font-semibold leading-tight">Staff invitation</h1>
      <Suspense fallback={<p className="text-muted" role="status">Checking your invitation…</p>}>
        <Body searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
