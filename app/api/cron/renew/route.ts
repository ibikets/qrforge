import { timingSafeEqual } from "node:crypto";
import { renewDueSubscriptions } from "@/lib/paystack";

export const maxDuration = 300;

// Vercel Cron calls this daily with `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: Request) {
  // Vercel only schedules crons on production, but a preview shares nothing with production money: refuse manual runs there too.
  if (process.env.VERCEL_ENV === "preview" && process.env.ALLOW_PREVIEW_CRON !== "true") return new Response("Renewals do not run on preview deployments", { status: 403 });
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("CRON_SECRET not configured", { status: 500 }); // fail closed
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return new Response("Unauthorized", { status: 401 });
  try {
    return Response.json(await renewDueSubscriptions());
  } catch (e) {
    console.error("renewal run failed", e instanceof Error ? e.message : e);
    return Response.json({ error: "Renewal run failed" }, { status: 500 });
  }
}
