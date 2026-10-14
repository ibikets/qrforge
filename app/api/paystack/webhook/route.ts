import { createHmac, timingSafeEqual } from "node:crypto";
import { activateFromReference, recordPaymentEvent } from "@/lib/paystack";

export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("x-paystack-signature") ?? "";
  const expected = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY ?? "").update(raw).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return new Response("Invalid signature", { status: 401 });

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (event.event === "charge.success" && event.data?.reference) {
    const r = await activateFromReference(event.data.reference);
    // Non-2xx on a retryable failure makes Paystack redeliver the event.
    if (r.transient) {
      await recordPaymentEvent(event.data.reference, "webhook", "retry_requested", event.event);
      return new Response("retry", { status: 503 });
    }
    await recordPaymentEvent(event.data.reference, "webhook", r.state, event.event);
  } else if (typeof event.data?.reference === "string") {
    await recordPaymentEvent(event.data.reference, "webhook", "ignored", typeof event.event === "string" ? event.event : undefined);
  }
  return new Response("ok");
}
