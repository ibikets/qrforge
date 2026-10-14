import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import AdminShell from "@/components/admin/AdminShell";
import ClaimOwner from "@/components/admin/ClaimOwner";
import MfaGate from "@/components/admin/MfaGate";
import IdleSignOut from "@/components/IdleSignOut";
import { LinkButton } from "@/components/ui/Button";
import { currentStaff } from "@/lib/admin/guard";
import { navFor } from "@/lib/admin/nav";
import { ROLE_LABEL } from "@/lib/admin/permissions";

export const metadata: Metadata = {
  title: { default: "Management", template: "%s · Qrenuvi management" },
  robots: { index: false, follow: false },
};

function Screen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto my-16 max-w-[520px] px-5">
      <h1 className="mb-3 text-[28px] font-semibold leading-tight">{title}</h1>
      {children}
    </div>
  );
}

async function Gate({ children }: { children: ReactNode }) {
  const s = await currentStaff();
  switch (s.status) {
    case "anonymous":
      return (
        <Screen title="Staff sign-in">
          <p className="mb-6 text-muted">Sign in with your staff account to open management. Your session ends after 20 minutes without activity.</p>
          <LinkButton href="/login?next=/admin">Sign in</LinkButton>
        </Screen>
      );
    case "unavailable":
      return (
        <Screen title="Management is not available yet">
          <p className="text-muted">
            {s.reason === "migration_pending"
              ? "The database update for management has not been applied. The Owner must apply it before anyone can sign in here."
              : s.reason === "not_configured"
                ? "Management is not configured on this deployment."
                : "Management could not check your access just now. Reload to try again."}
          </p>
        </Screen>
      );
    case "not_staff":
      return (
        <Screen title="No access">
          <IdleSignOut />
          <p className="text-muted">This account does not have management access. Your staff role cannot open this view.</p>
          {s.canBootstrap ? (
            <>
              <p className="mt-4 text-muted">No Owner has been set up yet, and this is the configured Owner email. You can claim the Owner seat once. You will then be asked to set up a second sign-in step.</p>
              <ClaimOwner />
            </>
          ) : null}
          <Link href="/" className="mt-6 inline-block font-medium text-brand no-underline">Back to Qrenuvi</Link>
        </Screen>
      );
    case "revoked":
      return (
        <Screen title="Access ended">
          <IdleSignOut />
          <p className="text-muted">This account no longer has management access. Ask the Owner if you think this is a mistake.</p>
          <Link href="/" className="mt-6 inline-block font-medium text-brand no-underline">Back to Qrenuvi</Link>
        </Screen>
      );
    case "needs_mfa":
      return (
        <>
          <IdleSignOut />
          <MfaGate />
        </>
      );
    case "ok":
      return (
        <AdminShell items={navFor(s.staff.caps).map(({ href, label }) => ({ href, label }))} roleLabel={ROLE_LABEL[s.staff.role]} email={s.staff.email} canSearch={s.staff.caps.has("customers.read") || s.staff.caps.has("customers.read_minimal")}>
          {children}
        </AdminShell>
      );
  }
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="mx-auto my-16 max-w-[520px] px-5" role="status" aria-busy="true"><p className="text-muted">Loading management…</p></div>}>
      <Gate>{children}</Gate>
    </Suspense>
  );
}
