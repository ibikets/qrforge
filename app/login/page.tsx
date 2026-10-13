import type { Metadata } from "next";
import { Suspense } from "react";
import AuthShell from "@/components/AuthShell";
import LoginForm from "@/components/LoginForm";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Sign in" };

async function Form({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const mode = one("mode") === "signup" ? "up" : "in";
  return (
    <AuthShell title={mode === "in" ? "Sign in" : "Create account"}>
      <LoginForm
        key={mode}
        next={safeNext(one("next"))}
        initialMode={mode}
        notice={one("error") === "auth" ? "auth-error" : one("reset") === "1" ? "reset-done" : null}
      />
    </AuthShell>
  );
}

export default function Login(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<AuthShell title="Sign in">{null}</AuthShell>}>
      <Form searchParams={props.searchParams} />
    </Suspense>
  );
}
