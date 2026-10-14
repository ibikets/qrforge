import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ACTIVE_COOKIE, IDLE_MS } from "@/lib/session-policy";
import { safeNext } from "@/lib/safe-next";

// Refreshes the Supabase session cookie so logins persist, and signs the user out after 20 minutes of inactivity.
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
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    // A stale clock must not survive into the next sign-in.
    if (request.cookies.has(ACTIVE_COOKIE)) response.cookies.delete(ACTIVE_COOKIE);
    return response;
  }

  const last = Number(request.cookies.get(ACTIVE_COOKIE)?.value);
  if (Number.isFinite(last) && last > 0 && Date.now() - last > IDLE_MS) {
    await sb.auth.signOut({ scope: "local" }); // revokes this session only, and clears its cookies via setAll
    const out = pathname.startsWith("/api/")
      ? NextResponse.json({ error: "Your session timed out. Sign in again." }, { status: 401, headers: { "Cache-Control": "no-store" } })
      : NextResponse.redirect(timeoutUrl(request));
    response.cookies.getAll().forEach((c) => out.cookies.set(c));
    out.cookies.delete(ACTIVE_COOKIE);
    return out;
  }

  // Signed-in users have no use for the sign-in page; send them on.
  if (pathname === "/login" && request.method === "GET") {
    const url = request.nextUrl.clone();
    const target = new URL(safeNext(searchParams.get("next")), request.url);
    url.pathname = target.pathname;
    url.search = target.search;
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  response.cookies.set(ACTIVE_COOKIE, String(Date.now()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/paystack/webhook|api/cron).*)"],
};

/** /login with a timeout notice, remembering where the user was (safeNext-checked again on use). */
function timeoutUrl(request: NextRequest) {
  const url = new URL("/login", request.url);
  url.searchParams.set("timeout", "1");
  const back = request.nextUrl.pathname + request.nextUrl.search;
  if (request.method === "GET" && back !== "/") url.searchParams.set("next", back);
  return url;
}
