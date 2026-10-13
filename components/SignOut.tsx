"use client";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function SignOut({ email }: { email: string }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-neutral-500 sm:inline">{email}</span>
      <button
        className="text-neutral-600 hover:text-neutral-900"
        onClick={async () => {
          await supabaseBrowser().auth.signOut();
          router.refresh();
        }}
      >
        Sign out
      </button>
    </div>
  );
}
