import { after } from "next/server";
import { adm } from "@/lib/admin/db";
import { GRACE_DAYS } from "@/lib/pages/policy";
import { SLUG, isBot, resolveLink, type Target } from "@/lib/links";
import { supabaseConfigured } from "@/lib/supabase";

const HDR = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" };
const page = (status: number, title: string, text: string) =>
  new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title><style>body{font:18px/1.5 system-ui,sans-serif;background:#f6f5f1;color:#17211b;margin:0;display:grid;min-height:100vh;place-items:center;padding:24px}main{max-width:420px;background:#fff;padding:32px;border-radius:16px;text-align:center}h1{font-size:24px;margin:0 0 8px}p{margin:0;color:#4b5a51}</style></head><body><main><h1>${title}</h1><p>${text}</p></main></body></html>`, { status, headers: { ...HDR, "Content-Type": "text/html; charset=utf-8" } });

/** Public redirect for a dynamic link. 302 on purpose: the destination can change, so nothing may cache it. */
async function handle(req: Request, ctx: { params: Promise<{ slug: string }> }, count: boolean) {
  const { slug } = await ctx.params;
  if (!SLUG.test(slug)) return page(404, "This link isn’t available", "Check the address or ask the person who shared it.");
  if (!supabaseConfigured || !process.env.SUPABASE_SERVICE_ROLE_KEY) return page(503, "Links aren’t available here", "This environment has no link storage connected.");
  const db = adm();
  const { data: link, error } = await db.from("links").select("id,user_id,destination,rules,state,taken_down_at,deleted_at").eq("slug", slug).maybeSingle();
  if (error) return page(503, "Temporarily unavailable", "We couldn’t look this link up. Try again in a moment.");
  if (!link) return page(404, "This link isn’t available", "Check the address or ask the person who shared it.");
  if (link.deleted_at || link.taken_down_at) return page(410, "This link isn’t available", "It was removed by its owner or by Qrenuvi.");
  const { data: sub } = await db.from("subscriptions").select("current_period_end").eq("user_id", link.user_id).maybeSingle();
  const end = sub ? new Date(sub.current_period_end).getTime() : 0;
  if (end + GRACE_DAYS * 86_400_000 < Date.now()) return page(410, "This link isn’t available", "Its owner’s plan has ended.");
  const ua = req.headers.get("user-agent");
  const record = (device: "ios" | "android" | "other", target: Target) => {
    if (!count) return;
    after(async () => { try { await db.rpc("record_link_open", { p_link: link.id, p_device: device, p_target: target, p_bot: isBot(ua) }); } catch { /* counting is best effort and never blocks a visitor */ } });
  };
  const r = resolveLink(link, ua);
  if (link.state === "paused") { record(r.device, "paused"); return page(200, "This link is switched off", "Its owner has paused it for now. Try again later."); }
  record(r.device, r.target);
  return new Response(null, { status: 302, headers: { ...HDR, Location: r.url } });
}
export const GET = (req: Request, ctx: { params: Promise<{ slug: string }> }) => handle(req, ctx, true);
export const HEAD = (req: Request, ctx: { params: Promise<{ slug: string }> }) => handle(req, ctx, false);
