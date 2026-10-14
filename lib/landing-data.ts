import { cacheLife, cacheTag } from "next/cache";
import { CONTENT_TAG, SETTINGS_TAG, SETTING_KEYS } from "@/lib/admin/consts";
import { DEFAULT_LANDING, validateLanding, type Landing } from "@/lib/content";
import { supabaseAdmin } from "@/lib/supabase";

/** The published landing content, re-validated on every read; any problem falls back to the built-in text. */
export async function getLanding(): Promise<Landing> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CONTENT_TAG);
  try {
    const db = supabaseAdmin();
    const pub = await db
      .from("content_published")
      .select("revision_id")
      .eq("page", "landing")
      .maybeSingle();
    if (pub.error || !pub.data) return DEFAULT_LANDING;
    const rev = await db
      .from("content_revisions")
      .select("data")
      .eq("id", (pub.data as { revision_id: number }).revision_id)
      .maybeSingle();
    if (rev.error || !rev.data) return DEFAULT_LANDING;
    const v = validateLanding((rev.data as { data: unknown }).data);
    return v.ok ? v.data : DEFAULT_LANDING;
  } catch {
    return DEFAULT_LANDING;
  }
}

export type SiteSettings = Partial<
  Record<(typeof SETTING_KEYS)[number], string>
>;

/** Real support and legal details, set by the Owner. Anything not set stays hidden from customers. */
export async function getSiteSettings(): Promise<SiteSettings> {
  "use cache";
  cacheLife("minutes");
  cacheTag(SETTINGS_TAG);
  try {
    const r = await supabaseAdmin().from("app_settings").select("key,value");
    if (r.error) return {};
    const out: SiteSettings = {};
    for (const row of r.data as { key: string; value: string }[])
      if ((SETTING_KEYS as readonly string[]).includes(row.key))
        out[row.key as keyof SiteSettings] = row.value;
    return out;
  } catch {
    return {};
  }
}
