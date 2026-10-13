import { QR_TYPES, type Fields, type QrType } from "@/lib/qr";

/**
 * Same-tab draft restoration across sign-in / upgrade redirects.
 * - sessionStorage only (never URLs, logs or the server); readable by same-origin scripts, not encrypted.
 * - Versioned, expires after 30 minutes, holds only the active type's fields.
 * - Only the opaque id travels in the URL (?draft=<id>).
 */
export type Draft = {
  type: QrType;
  fields: Fields;
  name: string;
  fg: string;
  bg: string;
  dots: "square" | "rounded" | "dots";
  size: number;
  format: "png" | "svg" | "pdf";
  logo: string | null;
  logoName: string | null;
};

const KEY = "qrf:draft";
const RETURN_KEY = "qrf:return";
export const DRAFT_TTL_MS = 30 * 60 * 1000;
export type LoadResult = { ok: true; draft: Draft } | { ok: false; reason: "missing" | "expired" | "invalid" };

const HEX = /^#[0-9a-fA-F]{6}$/;
const store = () => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

/** Anything other than plain URL/text content, or any logo, needs explicit consent to keep. */
export function isSensitive(d: Draft) {
  return (d.type !== "url" && d.type !== "text") || Boolean(d.logo);
}

export function hasContent(d: Draft) {
  return Object.values(d.fields).some((v) => v && v.trim() && v.trim() !== "https://");
}

export function saveDraft(d: Draft): string | null {
  const s = store();
  if (!s) return null;
  const id = crypto.randomUUID();
  try {
    s.setItem(KEY, JSON.stringify({ v: 1, id, t: Date.now(), d }));
    return id;
  } catch {
    return null; // quota or disabled storage: caller tells the user the draft was not kept
  }
}

export function loadDraft(id: string): LoadResult {
  const s = store();
  const raw = s?.getItem(KEY);
  if (!raw) return { ok: false, reason: "missing" };
  try {
    const j = JSON.parse(raw);
    if (j?.v !== 1 || j.id !== id) return { ok: false, reason: "missing" };
    if (typeof j.t !== "number" || Date.now() - j.t > DRAFT_TTL_MS) {
      s!.removeItem(KEY);
      return { ok: false, reason: "expired" };
    }
    const d = j.d;
    if (!QR_TYPES.some((t) => t.id === d?.type) || !d.fields || typeof d.fields !== "object") return { ok: false, reason: "invalid" };
    const fields: Fields = {};
    for (const [k, v] of Object.entries(d.fields)) if (typeof v === "string") fields[k] = v;
    return {
      ok: true,
      draft: {
        type: d.type,
        fields,
        name: typeof d.name === "string" ? d.name.slice(0, 80) : "",
        fg: HEX.test(d.fg) ? d.fg : "#111111",
        bg: HEX.test(d.bg) ? d.bg : "#ffffff",
        dots: d.dots === "rounded" || d.dots === "dots" ? d.dots : "square",
        size: Number.isFinite(d.size) ? Number(d.size) : 512,
        format: d.format === "svg" || d.format === "pdf" ? d.format : "png",
        logo: typeof d.logo === "string" ? d.logo : null,
        logoName: typeof d.logoName === "string" ? d.logoName.slice(0, 120) : null,
      },
    };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

export function clearDraft() {
  try {
    store()?.removeItem(KEY);
    store()?.removeItem(RETURN_KEY);
  } catch {}
}

/** Where to send the person after checkout (set before leaving, read on the payment result page). */
export function setReturnIntent(path: string) {
  if (path.startsWith("/") && !path.startsWith("//")) {
    try {
      store()?.setItem(RETURN_KEY, JSON.stringify({ path, t: Date.now() }));
    } catch {}
  }
}
export function readReturnIntent(): string | null {
  try {
    const j = JSON.parse(store()?.getItem(RETURN_KEY) ?? "null");
    if (j && typeof j.path === "string" && j.path.startsWith("/create?draft=") && Date.now() - j.t < DRAFT_TTL_MS) return j.path;
  } catch {}
  return null;
}
