/**
 * Public origin used in payment callbacks, reset links and invitations.
 * On a Vercel Preview deployment the configured production URL must never be used: a checkout started on a
 * preview would otherwise return the customer to production. Previews use the address the request arrived on.
 */
export function siteOrigin(req: Request): string {
  const fromRequest = new URL(req.url).origin;
  if (process.env.VERCEL_ENV === "preview") return fromRequest;
  return process.env.NEXT_PUBLIC_SITE_URL ?? fromRequest;
}
