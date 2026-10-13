import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase session cookie on every page request so logins persist.
export async function proxy(request: NextRequest) {
  // Legacy saved-code links: /?load=<id> now lives at /create?load=<id> (real HTTP redirect, keeps / static).
  const { pathname, searchParams } = request.nextUrl;
  if (pathname === "/" && searchParams.has("load")) {
    const url = request.nextUrl.clone();
    url.pathname = "/create";
    return NextResponse.redirect(url, 308);
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return NextResponse.next();

  let response = NextResponse.next({ request });
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (all) => {
        all.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        all.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await sb.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/paystack/webhook|api/cron).*)"],
};
