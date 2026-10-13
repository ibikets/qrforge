import type { Metadata } from "next";
import AuthShell from "@/components/AuthShell";
import ConfirmEmail from "@/components/ConfirmEmail";

export const metadata: Metadata = { title: "Confirm your email" };

export default function Page() {
  return (
    <AuthShell title="Confirm your email">
      <ConfirmEmail />
    </AuthShell>
  );
}
