// Staff activity ping. Passing through the proxy renews the STAFF inactivity clock.
export function POST() {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
