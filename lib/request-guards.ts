/** Small request-hardening helpers shared by the API routes. */

/**
 * Cross-site request check for state-changing routes (defence in depth on top of SameSite=Lax cookies).
 * Browsers always send Origin on cross-site POST/DELETE; non-browser clients (curl, server tests) send none and are allowed,
 * because they hold no ambient cookies to abuse.
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const o = new URL(origin);
    const u = new URL(req.url);
    return o.host === u.host || o.host === req.headers.get("x-forwarded-host");
  } catch {
    return false;
  }
}

export const forbidden = () => Response.json({ error: "Cross-site request blocked." }, { status: 403 });

/** Parse a JSON body with a hard size cap (rejects before parsing). Returns null for bad or oversized bodies. */
export async function readJson(req: Request, maxChars = 400_000): Promise<{ body: unknown } | { tooLarge: true } | null> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxChars) return { tooLarge: true };
  const text = await req.text().catch(() => null);
  if (text === null) return null;
  if (text.length > maxChars) return { tooLarge: true };
  try {
    return { body: JSON.parse(text) };
  } catch {
    return null;
  }
}

type Bucket = { n: number; reset: number };
const buckets = new Map<string, Bucket>();

/**
 * Best-effort fixed-window limiter. State lives in one server instance only, so on serverless it reduces bursts
 * but is NOT a global guarantee; pair it with a Vercel WAF rate-limit rule for real abuse control.
 */
export function rateLimit(req: Request, name: string, limit: number, windowMs = 60_000, who?: string | null): Response | null {
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const key = `${name}|${who ?? ip}`;
  const now = Date.now();
  if (buckets.size > 5000) for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    return null;
  }
  if (++b.n > limit) {
    return Response.json(
      { error: "Too many requests. Wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((b.reset - now) / 1000)) } },
    );
  }
  return null;
}
