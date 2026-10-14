import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import AdminShell from "@/components/admin/AdminShell";
import ClaimOwner from "@/components/admin/ClaimOwner";
import MfaGate from "@/components/admin/MfaGate";
import IdleSignOut from "@/components/IdleSignOut";
import StaffSignOutLink from "@/components/admin/StaffSignOutLink";
import { currentStaff } from "@/lib/admin/guard";
import { navFor } from "@/lib/admin/nav";
import { ROLE_LABEL } from "@/lib/admin/permissions";

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
      // The proxy adds ?next= for deep links; this covers any request that reaches the layout without it.
      redirect("/admin/login");
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
          <IdleSignOut staff />
          {s.canBootstrap ? (
            <>
              <p className="text-muted">Finish setting up this account. You will be asked to add an authenticator app next.</p>
              <ClaimOwner />
            </>
          ) : (
            <p className="text-muted">This account does not have management access.</p>
          )}
          <StaffSignOutLink />
          <Link href="/" className="mt-6 inline-block font-medium text-brand no-underline">Back to Qrenuvi</Link>
        </Screen>
      );
    case "revoked":
      return (
        <Screen title="Access ended">
          <IdleSignOut staff />
          <p className="text-muted">This account no longer has management access. Ask the Owner if you think this is a mistake.</p>
          <StaffSignOutLink />
          <Link href="/" className="mt-6 inline-block font-medium text-brand no-underline">Back to Qrenuvi</Link>
        </Screen>
      );
    case "needs_mfa":
      return (
        <>
          <IdleSignOut staff />
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
