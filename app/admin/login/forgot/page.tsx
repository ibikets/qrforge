import type { Metadata } from "next";
import AuthShell from "@/components/AuthShell";
import StaffRecoverForm from "@/components/admin/StaffRecoverForm";

export const metadata: Metadata = { title: "Staff password" };

export default function StaffForgot() {
  return (
    <AuthShell title="Set or reset your password" lead="Enter your staff email. If it has management access, we send a link to set a password.">
      <StaffRecoverForm />
    </AuthShell>
  );
}
