import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { staffCookieOptions } from "@/lib/staff-auth";

/** Server client for the STAFF session (server components and route handlers). */
export async function staffServer() {
  await connection();
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    db: { schema: "qrforge" },
    cookieOptions: staffCookieOptions(),
    cookies: {
      getAll: () => store.getAll(),
      setAll: (all) => {
        try {
          all.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Server Component: cookies are refreshed by the proxy instead
        }
      },
    },
  });
}
