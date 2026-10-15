import { revalidateTag } from "next/cache";
import { SETTINGS_TAG, SETTING_KEYS } from "@/lib/admin/consts";
import { adm } from "@/lib/admin/db";
import { adminActions, fail } from "@/lib/admin/guard";
import { SUPPORT_ADDRESS, emailEnabled, emailStatus, sendEmail } from "@/lib/email";
import { email, httpsUrl, int, must, oneOf, str } from "@/lib/admin/validate";

export const POST = adminActions({
  set: {
    cap: "settings.manage",
    async handler({ staff, body }) {
      const key = oneOf(body, "key", SETTING_KEYS, "Setting");
      const expected = int(body, "version", { min: 0, max: 1_000_000 })!;
      const value = key === "support_email" ? email(body, "value") : httpsUrl(str(body, "value", { max: 300, label: "Address" }), "value");
      const db = adm();
      const prev = must(await db.from("app_settings").select("value,version").eq("key", key).maybeSingle());
      const now = new Date().toISOString();
      if (expected === 0) {
        if (prev) throw fail(409, "This was changed by someone else since you opened it. Reload to see the latest version.");
        must(await db.from("app_settings").insert({ key, value, updated_by: staff.userId, updated_at: now }).select("key").single());
      } else {
        const r = must(await db.from("app_settings").update({ value, version: expected + 1, updated_by: staff.userId, updated_at: now }).eq("key", key).eq("version", expected).select("key").maybeSingle());
        if (!r) throw fail(409, "This was changed by someone else since you opened it. Reload to see the latest version.");
      }
      revalidateTag(SETTINGS_TAG, "max");
      return { audit: { action: "setting.changed", targetType: "setting", targetId: key, before: prev ? { value: prev.value } : {}, after: { value } } };
    },
  },
  clear: {
    cap: "settings.manage",
    async handler({ body }) {
      const key = oneOf(body, "key", SETTING_KEYS, "Setting");
      const r = must(await adm().from("app_settings").delete().eq("key", key).select("key").maybeSingle());
      if (!r) throw fail(409, "That setting is already empty.");
      revalidateTag(SETTINGS_TAG, "max");
      return { audit: { action: "setting.cleared", targetType: "setting", targetId: key } };
    },
  },
  // One clearly labelled message to the support address itself (never a customer; the recipient is not taken from the request).
  send_test_email: {
    cap: "settings.manage",
    reason: false,
    limit: 5,
    async handler({ staff }) {
      if (!emailEnabled()) throw fail(424, "Email sending is switched off on this deployment (missing key, or not the live site).");
      const r = await sendEmail({
        to: SUPPORT_ADDRESS,
        subject: "[Qrenuvi TEST] Support email delivery check",
        text: "This is a test message sent from the Qrenuvi staff Settings page to check that support email works.\nNo customer was emailed and no ticket was changed. You can delete this message.",
        idempotencyKey: `qrenuvi-test-${staff.userId}-${Date.now()}`,
      });
      if (!r.ok) {
        const msg = { sender_not_verified: "Not sent: the email service says the sending domain is not verified yet.", rate_limited: "Not sent: the email service is busy. Try again shortly.", unreachable: "Could not reach the email service. Nothing was confirmed.", rejected: "Not sent: the email service refused the message (check the key's sending permission and the From address).", invalid: "Not sent: invalid message.", disabled: "Email sending is off." }[r.code];
        throw fail(r.code === "invalid" ? 422 : 502, msg);
      }
      await new Promise((res) => setTimeout(res, 2500));
      const st = await emailStatus(r.id);
      return { data: { id: r.id, lastEvent: st.ok ? st.lastEvent : "unknown" }, audit: { action: "email.test_sent", targetType: "setting", targetId: "support_email", after: { to: SUPPORT_ADDRESS, provider_id: r.id, last_event: st.ok ? st.lastEvent : "unknown" } } };
    },
  },
  test_email_status: {
    cap: "settings.manage",
    reason: false,
    limit: 30,
    async handler({ body }) {
      const id = typeof body.id === "string" ? body.id : "";
      const st = await emailStatus(id);
      if (!st.ok) throw fail(502, "The email service did not return a status for that message.");
      return { data: { id, lastEvent: st.lastEvent } };
    },
  },
});
