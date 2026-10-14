/** Same integer rounding as the database (half up), used only to PREVIEW what a quote will show. */
export const savingKobo = (c: { discount_kind: string; basis_points: number | null; fixed_kobo: number | null }, base: number) =>
  c.discount_kind === "percent" ? Math.floor((base * (c.basis_points ?? 0) + 5000) / 10000) : (c.fixed_kobo ?? 0);

export const toLagosInput = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 3600_000); // Lagos is UTC+1 all year
  return d.toISOString().slice(0, 16);
};
export const CAMPAIGN_STATE: Record<string, [string, "good" | "warn" | "bad" | "neutral"]> = {
  draft: ["Draft", "warn"], scheduled: ["Live", "good"], active: ["Live", "good"], paused: ["Paused", "neutral"], ended: ["Ended", "neutral"], archived: ["Archived", "neutral"],
};
