import { randomBytes } from "node:crypto";
import { revalidateTag } from "next/cache";
import { adm } from "@/lib/admin/db";
import type { Card } from "@/lib/pages/card";
import { PLANS, type PlanId } from "@/lib/plans";
import { forbidden, rateLimit, sameOrigin } from "@/lib/request-guards";
import { getSession, supabaseConfigured } from "@/lib/supabase";

export const PAGE_BUCKET = "page-media";
export const GRACE_DAYS = 30;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PUBLIC_ID = /^[a-z2-9]{10}$/;
export const pageTag = (publicId: string) => `page:${publicId}`;
const ALPHA = "abcdefghjkmnpqrstuvwxyz23456789"; // no look-alikes (i l o 0 1)

/** 10 random characters from a 31-letter alphabet (about 49 bits). Opaque: carries no owner, title or order. */
export function newPublicId(): string {
  const b = randomBytes(10);
  return Array.from(b, (x) => ALPHA[x % ALPHA.length]).join("");
}
export const noStore = { "Cache-Control": "no-store" };
export const jerr = (status: number, error: string, extra: Record<string, unknown> = {}) => Response.json({ error, ...extra }, { status, headers: noStore });
export const refreshPage = (publicId: string) => revalidateTag(pageTag(publicId), { expire: 0 }) // never serve a stale card after publish, unpublish, delete or takedown;

export type PageRow = {
  id: string; user_id: string; kind: "card"; title: string; public_id: string; draft: unknown; draft_version: number;
  published_version: number | null; lifecycle: "draft" | "published" | "unpublished" | "archived" | "deleted";
  taken_down_at: string | null; created_at: string; updated_at: string; published_at: string | null;
};
export const PAGE_COLS = "id,user_id,kind,title,public_id,draft,draft_version,published_version,lifecycle,taken_down_at,created_at,updated_at,published_at";

/** Authenticated customer for a mutating route: same-origin, signed in, rate limited, hosted pages available to the plan. */
export async function customer(req: Request, name: string, limit = 60, opts: { needsPlan?: boolean } = {}) {
  if (!sameOrigin(req)) return { response: forbidden() };
  if (!supabaseConfigured || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { response: jerr(503, "Hosted pages are not available in this environment.", { code: "unconfigured" }) };
  const s = await getSession();
  if (!s.userId) return { response: jerr(401, "Please sign in.") };
  const limited = rateLimit(req, name, limit, 60_000, s.userId);
  if (limited) return { response: limited };
  if (opts.needsPlan && PLANS[s.plan].maxPages === 0)
    return { response: jerr(403, "Your plan does not include hosted pages. Choose Pro or Business to create and edit them. Anything you published stays visible during the grace period.", { code: "plan" }) };
  return { userId: s.userId, plan: s.plan as PlanId };
}

export async function ownedPage(id: string, userId: string): Promise<PageRow | null> {
  if (!UUID.test(id)) return null;
  const { data } = await adm().from("pages").select(PAGE_COLS).eq("id", id).eq("user_id", userId).neq("lifecycle", "deleted").maybeSingle();
  return (data as PageRow | null) ?? null;
}

/** True when the tables from migration 20261016000000 exist. */
export function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === "42P01" || error.code === "PGRST205" || /relation .*pages.* does not exist|Could not find the table/i.test(error.message ?? ""));
}

/** Delete page_media rows (and files) that the draft and every kept revision no longer reference. */
export async function collectMedia(pageId: string, draftIds: (string | null)[]) {
  const db = adm();
  const [{ data: media }, { data: revs }] = await Promise.all([
    db.from("page_media").select("id,path,vcf_path").eq("page_id", pageId),
    db.from("page_revisions").select("content").eq("page_id", pageId),
  ]);
  const keep = new Set<string>(draftIds.filter((x): x is string => !!x));
  for (const r of revs ?? []) for (const k of ["portraitId", "logoId"]) { const v = (r.content as Record<string, unknown>)?.[k]; if (typeof v === "string") keep.add(v); }
  const drop = (media ?? []).filter((m: { id: string }) => !keep.has(m.id));
  if (!drop.length) return;
  await db.storage.from(PAGE_BUCKET).remove(drop.flatMap((m: { path: string; vcf_path: string | null }) => [m.path, ...(m.vcf_path ? [m.vcf_path] : [])]));
  await db.from("page_media").delete().in("id", drop.map((m: { id: string }) => m.id));
}

export type PublicResult =
  | { state: "ok"; publicId: string; version: number; snapshot: unknown; grace: boolean }
  | { state: "unavailable" }
  | { state: "unconfigured" };

/** What the public may see, or an unavailable state. Used by the page, the media route and the contact file. */
export async function loadPublic(publicId: string): Promise<PublicResult> {
  if (!PUBLIC_ID.test(publicId)) return { state: "unavailable" };
  if (!supabaseConfigured || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { state: "unconfigured" };
  const db = adm();
  const { data: page, error } = await db.from("pages").select("id,user_id,lifecycle,published_version,taken_down_at").eq("public_id", publicId).maybeSingle();
  if (error && !isMissingTable(error)) throw new Error("page lookup failed");
  if (!page || page.lifecycle !== "published" || page.published_version == null || page.taken_down_at) return { state: "unavailable" };
  // Lifecycle policy: the page stays public while the owner's plan is active and for GRACE_DAYS after it lapses.
  const { data: sub } = await db.from("subscriptions").select("current_period_end").eq("user_id", page.user_id).maybeSingle();
  const end = sub ? new Date(sub.current_period_end).getTime() : 0;
  const now = Date.now();
  if (end + GRACE_DAYS * 86_400_000 < now) return { state: "unavailable" };
  const { data: rev } = await db.from("page_revisions").select("content").eq("page_id", page.id).eq("version", page.published_version).maybeSingle();
  if (!rev) return { state: "unavailable" };
  return { state: "ok", publicId, version: page.published_version, snapshot: rev.content, grace: end < now };
}

/** Media row for a published snapshot reference, or null. Never returns draft-only media. */
export async function publicMedia(publicId: string, mediaId: string) {
  const r = await loadPublic(publicId);
  if (r.state !== "ok" || !UUID.test(mediaId)) return null;
  const s = r.snapshot as { portraitId?: string | null; logoId?: string | null };
  if (mediaId !== s.portraitId && mediaId !== s.logoId) return null;
  const { data } = await adm().from("page_media").select("id,path,vcf_path,mime").eq("id", mediaId).maybeSingle();
  return data as { id: string; path: string; vcf_path: string | null; mime: string } | null;
}

/** Media referenced by a draft must belong to this page. */
export async function mediaBelongs(pageId: string, card: Card): Promise<boolean> {
  const ids = [card.portraitId, card.logoId].filter((x): x is string => !!x);
  if (!ids.length) return true;
  const { data } = await adm().from("page_media").select("id,kind").eq("page_id", pageId).in("id", ids);
  const kinds = new Map((data ?? []).map((m: { id: string; kind: string }) => [m.id, m.kind]));
  return (!card.portraitId || kinds.get(card.portraitId) === "portrait") && (!card.logoId || kinds.get(card.logoId) === "logo");
}

