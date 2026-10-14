// Activity ping. Going through the proxy is the whole point: it renews the inactivity clock (see proxy.ts).
export function POST() {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
