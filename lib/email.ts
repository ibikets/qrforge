/**
 * Transactional email through Resend (staff support replies). The key lives only in the RESEND_API_KEY environment variable.
 * Sending is on in production, or anywhere EMAIL_SEND_ENABLED=true (tests point RESEND_API_URL at a local stand-in), so previews never email customers.
 */
export const RESEND_API = process.env.RESEND_API_URL ?? "https://api.resend.com";
export const SUPPORT_ADDRESS = "qrenuvi@bitzpark.com";
export const emailEnabled = () => Boolean(process.env.RESEND_API_KEY) && (process.env.VERCEL_ENV === "production" || process.env.EMAIL_SEND_ENABLED === "true");
export const fromAddress = () => process.env.EMAIL_FROM || `Qrenuvi Support <${SUPPORT_ADDRESS}>`;

export type SendResult = { ok: true; id: string } | { ok: false; code: "disabled" | "sender_not_verified" | "rejected" | "rate_limited" | "unreachable" | "invalid"; retryable: boolean };

export async function sendEmail(m: { to: string; subject: string; text: string; idempotencyKey: string; replyTo?: string }): Promise<SendResult> {
  if (!emailEnabled()) return { ok: false, code: "disabled", retryable: false };
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(m.to) || /[\r\n]/.test(m.subject)) return { ok: false, code: "invalid", retryable: false };
  try {
    const r = await fetch(`${RESEND_API}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": m.idempotencyKey },
      body: JSON.stringify({ from: fromAddress(), to: [m.to], reply_to: m.replyTo ?? SUPPORT_ADDRESS, subject: m.subject, text: m.text }),
      signal: AbortSignal.timeout(10_000), cache: "no-store",
    });
    const j = (await r.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (r.ok && j.id) return { ok: true, id: j.id };
    if (r.status === 429) return { ok: false, code: "rate_limited", retryable: true };
    if (r.status === 403 || /domain.*(not|isn.t).*verified|not verified/i.test(j.message ?? "")) return { ok: false, code: "sender_not_verified", retryable: false };
    if (r.status >= 500) return { ok: false, code: "unreachable", retryable: true };
    return { ok: false, code: "rejected", retryable: false };
  } catch {
    return { ok: false, code: "unreachable", retryable: true };
  }
}

/** Read-only check of the sender domain for the staff Integrations page. Never reports verified unless Resend says so. */
export async function senderDomainStatus(): Promise<{ state: "verified" | "failed" | "unverified"; detail: string }> {
  if (!process.env.RESEND_API_KEY) return { state: "unverified", detail: "No email key is configured on this deployment." };
  try {
    const r = await fetch(`${RESEND_API}/domains`, { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }, cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!r.ok) return { state: "failed", detail: r.status === 401 || r.status === 403 ? "The email service rejected the key (or it is send-only, so domains cannot be listed)." : `The email service answered with status ${r.status}.` };
    const j = (await r.json()) as { data?: { name: string; status: string }[] };
    const host = SUPPORT_ADDRESS.split("@")[1];
    const d = (j.data ?? []).find((x) => x.name === host);
    if (!d) return { state: "failed", detail: `${host} is not added in the email service yet, so mail from ${SUPPORT_ADDRESS} will be refused.` };
    return d.status === "verified" ? { state: "verified", detail: `${host} is verified for sending.${emailEnabled() ? "" : " Sending is switched off on this deployment."}` } : { state: "failed", detail: `${host} is ${d.status}. Add the DNS records the email service shows for it, then verify.` };
  } catch {
    return { state: "failed", detail: "The email service could not be reached." };
  }
}
