import Link from "next/link";
import { getSession } from "@/lib/supabase";
import SignOut from "@/components/SignOut";

export default async function AuthNav() {
  const { email } = await getSession();
  return email ? (
    <>
      <Link href="/codes" className="text-neutral-600 hover:text-neutral-900">
        My codes
      </Link>
      <Link href="/billing" className="text-neutral-600 hover:text-neutral-900">
        Billing
      </Link>
      <SignOut email={email} />
    </>
  ) : (
    <Link href="/login" className="rounded-lg bg-neutral-900 px-4 py-2 text-white">
      Sign in
    </Link>
  );
}
