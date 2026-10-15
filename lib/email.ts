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

export type DomainRecord = { name: string; type: string; status: string };
export type DomainStatus = { state: "verified" | "failed" | "unverified"; detail: string; records?: DomainRecord[] };
const auth = () => ({ Authorization: `Bearer ${process.env.RESEND_API_KEY}` });

/**
 * Read-only check of the sender domain for the staff Integrations page. Never reports verified unless Resend says so.
 * Distinguishes: no key, key refused, send-only key (domains cannot be read), domain missing, pending verification (with the unresolved record names),
 * failed verification and verified. A send-only key is a normal, safe choice: the test email is then the real check.
 */
export async function senderDomainStatus(): Promise<DomainStatus> {
  if (!process.env.RESEND_API_KEY) return { state: "unverified", detail: "No email key is configured on this deployment (missing configuration)." };
  const host = SUPPORT_ADDRESS.split("@")[1];
  const sender = `From: ${fromAddress()}. Reply-To: ${SUPPORT_ADDRESS}.`;
  try {
    const r = await fetch(`${RESEND_API}/domains`, { headers: auth(), cache: "no-store", signal: AbortSignal.timeout(5000) });
    const j = (await r.json().catch(() => ({}))) as { data?: { id: string; name: string; status: string }[]; name?: string };
    if (r.status === 401 && j.name === "restricted_api_key") return { state: "unverified", detail: `The key is send-only, so domain status cannot be read here. That is fine for sending: use "Send test email" to confirm real delivery. ${sender}` };
    if (r.status === 401 || r.status === 403) return { state: "failed", detail: "The email service rejected the key (invalid or revoked). Provider rejection, not a DNS problem." };
    if (!r.ok) return { state: "failed", detail: `The email service answered with status ${r.status}.` };
    const d = (j.data ?? []).find((x) => x.name === host);
    if (!d) return { state: "failed", detail: `${host} is not added in this email account, so mail from ${SUPPORT_ADDRESS} will be refused. (Check the key belongs to the account where the domain was added.)` };
    let records: DomainRecord[] | undefined;
    try {
      const dr = await fetch(`${RESEND_API}/domains/${encodeURIComponent(d.id)}`, { headers: auth(), cache: "no-store", signal: AbortSignal.timeout(5000) });
      const dj = (await dr.json().catch(() => ({}))) as { records?: { record?: string; name: string; type: string; status: string }[] };
      records = (dj.records ?? []).map((x) => ({ name: x.name, type: x.type, status: x.status }));
    } catch { /* records are a courtesy */ }
    const open = (records ?? []).filter((x) => x.status !== "verified");
    if (d.status === "verified") return { state: "verified", detail: `${host} is verified for sending. ${sender}${emailEnabled() ? "" : " Sending is switched off on this deployment."}`, records };
    const which = open.length ? ` Unresolved: ${open.map((x) => `${x.type} ${x.name} (${x.status})`).join(", ")}.` : "";
    if (d.status === "failed") return { state: "failed", detail: `Verification of ${host} failed.${which} Check these records in DNS match what the email service shows exactly.`, records };
    return { state: "unverified", detail: `${host} is pending verification (${d.status}).${which} DNS changes can take time; the email service re-checks on its own.`, records };
  } catch {
    return { state: "failed", detail: "The email service could not be reached." };
  }
}

/** What Resend reports for one message: accepted by Resend is not the same as delivered to the inbox. */
export async function emailStatus(id: string): Promise<{ ok: true; lastEvent: string } | { ok: false }> {
  if (!process.env.RESEND_API_KEY || !/^[0-9a-f-]{36}$/i.test(id)) return { ok: false };
  try {
    const r = await fetch(`${RESEND_API}/emails/${id}`, { headers: auth(), cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!r.ok) return { ok: false };
    const j = (await r.json()) as { last_event?: string };
    return { ok: true, lastEvent: typeof j.last_event === "string" ? j.last_event : "unknown" };
  } catch { return { ok: false }; }
}
