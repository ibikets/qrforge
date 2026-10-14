/**
 * Repeatable contact fields (phone, email, website, social) for the vCard type.
 *
 * Storage stays a flat string map so saved records, drafts and the API need no new shape:
 *   row 1 keeps the original key (`phone`, `email`, `website`) so records saved before this existed load unchanged;
 *   later rows are `<base>_2` ... `<base>_5`; the optional label/platform of a row is `<value key>_type`.
 * A row exists when its value key is present in the map, even if the value is still empty (a freshly added row).
 */
export type ContactGroup = "phone" | "email" | "website" | "social";

export const MAX_ROWS = 5;

export const GROUPS: Record<ContactGroup, { label: string; singular: string; plural: string; types: { id: string; label: string }[]; defaultType: string }> = {
  phone: {
    label: "Phone",
    singular: "phone number",
    plural: "phone numbers",
    defaultType: "mobile",
    types: [
      { id: "mobile", label: "Mobile" },
      { id: "work", label: "Work" },
      { id: "home", label: "Home" },
    ],
  },
  email: {
    label: "Email",
    singular: "email address",
    plural: "email addresses",
    defaultType: "work",
    types: [
      { id: "work", label: "Work" },
      { id: "home", label: "Personal" },
    ],
  },
  website: { label: "Website", singular: "website", plural: "websites", defaultType: "", types: [] },
  social: {
    label: "Social",
    singular: "social profile",
    plural: "social profiles",
    defaultType: "instagram",
    types: [
      { id: "instagram", label: "Instagram" },
      { id: "linkedin", label: "LinkedIn" },
      { id: "x", label: "X" },
      { id: "facebook", label: "Facebook" },
      { id: "tiktok", label: "TikTok" },
      { id: "youtube", label: "YouTube" },
      { id: "github", label: "GitHub" },
      { id: "other", label: "Other link" },
    ],
  },
};

export const GROUP_KEYS = Object.keys(GROUPS) as ContactGroup[];

/** Profile address built from a handle. `{h}` is the cleaned handle. */
const SOCIAL_URL: Record<string, string> = {
  instagram: "https://instagram.com/{h}",
  linkedin: "https://linkedin.com/in/{h}",
  x: "https://x.com/{h}",
  facebook: "https://facebook.com/{h}",
  tiktok: "https://tiktok.com/@{h}",
  youtube: "https://youtube.com/@{h}",
  github: "https://github.com/{h}",
};
const HANDLE = /^[A-Za-z0-9._-]{1,60}$/;

export const valueKey = (g: ContactGroup, i: number) => (i <= 1 ? g : `${g}_${i}`);
export const typeKey = (g: ContactGroup, i: number) => `${valueKey(g, i)}_type`;

export type Row = { i: number; key: string; tKey: string; value: string; type: string };

/** Rows in order. Always at least one, so the first row of each group is always shown. */
export function rowsOf(f: Record<string, string>, g: ContactGroup): Row[] {
  const out: Row[] = [];
  for (let i = 1; i <= MAX_ROWS; i++) {
    const key = valueKey(g, i);
    if (i === 1 || key in f) out.push({ i, key, tKey: typeKey(g, i), value: f[key] ?? "", type: f[typeKey(g, i)] || GROUPS[g].defaultType });
  }
  return out;
}

/** Adds an empty row at the first free index, or returns the map unchanged at the limit. */
export function addRow<F extends Record<string, string>>(f: F, g: ContactGroup): F {
  for (let i = 2; i <= MAX_ROWS; i++) if (!(valueKey(g, i) in f)) return { ...f, [valueKey(g, i)]: "" };
  return f;
}

/** Removes a row and shifts later rows up so indexes stay contiguous. Row 1 is cleared, never removed. */
export function removeRow<F extends Record<string, string>>(f: F, g: ContactGroup, i: number): F {
  const rows = rowsOf(f, g);
  const keep = rows.filter((r) => r.i !== i);
  const next: Record<string, string> = { ...f };
  for (let n = 1; n <= MAX_ROWS; n++) {
    delete next[valueKey(g, n)];
    delete next[typeKey(g, n)];
  }
  if (keep.length === 0) next[valueKey(g, 1)] = "";
  keep.forEach((r, idx) => {
    next[valueKey(g, idx + 1)] = r.value;
    if (f[r.tKey] !== undefined) next[typeKey(g, idx + 1)] = f[r.tKey];
  });
  return next as F;
}

/** Every key the vCard type may carry. Anything else is rejected or dropped before saving. */
export function vcardKeys(): Set<string> {
  const s = new Set(["firstName", "lastName", "org", "title", "photo"]); // photo: small JPEG for the downloadable contact file only; never in the QR payload
  for (const g of GROUP_KEYS) for (let i = 1; i <= MAX_ROWS; i++) { s.add(valueKey(g, i)); s.add(typeKey(g, i)); }
  return s;
}

const digits = (s: string) => s.replace(/\D/g, "");
export const dedupeKey = (g: ContactGroup, v: string, type = ""): string => {
  const t = v.trim();
  if (g === "phone") return digits(t);
  if (g === "email") return t.toLowerCase();
  if (g === "social") return socialUrl(type, t)?.toLowerCase() ?? t.toLowerCase();
  return t.toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
};

/** Handle or pasted address -> https profile address, or null when it cannot be made safely. */
export function socialUrl(platform: string, raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^https:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      return u.protocol === "https:" && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname) ? u.toString() : null;
    } catch {
      return null;
    }
  }
  const tpl = SOCIAL_URL[platform];
  if (!tpl) return null; // "Other link" needs a full https:// address
  const h = v.replace(/^@/, "");
  return HANDLE.test(h) ? tpl.replace("{h}", h) : null;
}

export function socialError(platform: string, raw: string): string | null {
  if (!raw.trim()) return null;
  if (platform !== "other" && !SOCIAL_URL[platform]) return "Choose a platform.";
  if (platform === "other" && !/^https:\/\//i.test(raw.trim())) return "For other links, enter the full address starting with https://.";
  if (!socialUrl(platform, raw)) return platform === "other" ? "Enter a valid https:// address." : "Use the handle only (letters, numbers, . _ -) or a full https:// address.";
  return null;
}

const VTYPE: Record<string, string> = { mobile: "CELL", work: "WORK", home: "HOME" };
/** vCard 3.0 TEL type; the original single-phone output (`TYPE=CELL`) is kept for records without a label. */
export const telType = (t: string) => VTYPE[t] ?? "CELL";
export const emailType = (t: string) => (t === "home" ? "INTERNET,HOME" : "INTERNET,WORK");

/** vCard 3.0 text escaping (RFC 2426 section 5): backslash, semicolon, comma and newline. */
export const vEsc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
