import { revalidateTag } from "next/cache";
import { SETTINGS_TAG, SETTING_KEYS } from "@/lib/admin/consts";
import { adm } from "@/lib/admin/db";
import { adminActions, fail } from "@/lib/admin/guard";
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
});
