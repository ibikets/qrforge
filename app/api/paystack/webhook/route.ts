import { createHmac, timingSafeEqual } from "node:crypto";
import { activateFromReference } from "@/lib/paystack";

export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("x-paystack-signature") ?? "";
  const expected = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY ?? "").update(raw).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return new Response("Invalid signature", { status: 401 });

  const event = JSON.parse(raw);
  if (event.event === "charge.success" && event.data?.reference) {
    await activateFromReference(event.data.reference);
  }
  return new Response("ok");
}
