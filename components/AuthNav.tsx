import { getSession } from "@/lib/supabase";
import NavShell from "@/components/NavShell";

/** Reads the session (dynamic); render inside <Suspense>. */
export default async function AuthNav() {
  const { email } = await getSession();
  return <NavShell email={email} />;
}
