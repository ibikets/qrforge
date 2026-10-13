import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { safeNext } from "@/lib/safe-next";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const dest = safeNext(searchParams.get("next"));
  const recovery = dest.startsWith("/reset-password");

  if (code && !searchParams.get("error")) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${dest}`);
  }
  return NextResponse.redirect(`${origin}${recovery ? "/reset-password?state=expired" : "/login?error=auth"}`);
}
