import type { Metadata } from "next";
import AuthShell from "@/components/AuthShell";
import ForgotForm from "@/components/ForgotForm";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPassword() {
  return (
    <AuthShell title="Reset your password" lead="Enter your email and we’ll send a link to choose a new password.">
      <ForgotForm />
    </AuthShell>
  );
}
