import { cookies } from "next/headers";
import { forbidden, sameOrigin } from "@/lib/request-guards";
import { STAFF_ACTIVE_COOKIE } from "@/lib/staff-auth";
import { staffServer } from "@/lib/staff-server";

/** Ends the STAFF session only (this session's refresh token is revoked). A customer session in the same browser is untouched. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const sb = await staffServer();
  await sb.auth.signOut({ scope: "local" }).catch(() => {});
  (await cookies()).delete(STAFF_ACTIVE_COOKIE);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
