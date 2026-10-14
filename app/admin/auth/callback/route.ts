import { NextResponse } from "next/server";
import { staffServer } from "@/lib/staff-server";

/** Email-link landing for staff recovery. Exchanges the code into the STAFF session, then shows the set-password form. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (code && !searchParams.get("error")) {
    const sb = await staffServer();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/admin/reset-password`);
  }
  return NextResponse.redirect(`${origin}/admin/reset-password?state=expired`);
}
