import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import AuthShell from "@/components/AuthShell";
import StaffLoginForm from "@/components/admin/StaffLoginForm";
import { Notice } from "@/components/ui/Notice";
import { currentStaff } from "@/lib/admin/guard";
import { safeStaffNext } from "@/lib/staff-auth";

export const metadata: Metadata = { title: "Staff sign-in" };

async function Body({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const next = safeStaffNext(one("next"));
  const s = await currentStaff();
  // Already signed in to the staff session (or only the second step is missing): carry on where they were going.
  if (s.status === "ok" || s.status === "needs_mfa" || s.status === "not_staff") redirect(next);
  return (
    <AuthShell title="Staff sign-in" lead="For Qrenuvi staff only. Customers sign in on the main site.">
      {one("timeout") === "1" ? (
        <Notice live title="You were signed out">
          Staff sessions end after 20 minutes without activity. Sign in to continue.
        </Notice>
      ) : null}
      {one("reset") === "1" ? (
        <Notice live title="Password saved">
          Sign in with your new password. You will be asked for your authenticator code next.
        </Notice>
      ) : null}
      {s.status === "revoked" ? (
        <Notice tone="warning" live title="Access ended">
          This account no longer has management access. Ask the Owner if you think this is a mistake.
        </Notice>
      ) : null}
      <StaffLoginForm next={next} />
    </AuthShell>
  );
}

export default function StaffLogin(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<AuthShell title="Staff sign-in">{null}</AuthShell>}>
      <Body searchParams={props.searchParams} />
    </Suspense>
  );
}
