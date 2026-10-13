"use client";
import { useState } from "react";
import { FIELD_DEFS, QR_TYPES, type Fields, type QrType } from "@/lib/qr";
import type { FieldErrors } from "@/lib/qr-validation";
import { controlClass, SelectField } from "@/components/ui/Field";

const EXTRA: Record<string, { type?: string; inputMode?: "url" | "email" | "tel" | "text"; autoComplete?: string; help?: string }> = {
  "url.url": { type: "text", inputMode: "url", autoComplete: "off", help: "Use a full address, for example https://example.com." },
  "email.to": { type: "email", inputMode: "email", autoComplete: "off" },
  "phone.phone": { type: "tel", inputMode: "tel", autoComplete: "off", help: "Include the country code, for example +234…" },
  "sms.phone": { type: "tel", inputMode: "tel", autoComplete: "off", help: "Include the country code." },
  "whatsapp.phone": { type: "tel", inputMode: "tel", autoComplete: "off", help: "Digits with country code, no leading +, for example 2348000000000." },
  "vcard.phone": { type: "tel", inputMode: "tel", autoComplete: "off" },
  "vcard.email": { type: "email", inputMode: "email", autoComplete: "off" },
  "vcard.website": { type: "text", inputMode: "url", autoComplete: "off" },
};

const TYPE_HELP: Record<QrType, string> = {
  url: "Share a website, booking page or menu link.",
  text: "Plain text people see when they scan. Line breaks are kept.",
  email: "Opens a new email to this address, with optional subject and message.",
  phone: "Lets people start a call to this number.",
  sms: "Opens a text message to this number with your message ready.",
  whatsapp: "Opens a WhatsApp chat with this number.",
  wifi: "Lets people join the network by scanning. Anyone with the code can read the password.",
  vcard: "Lets people save your contact details to their phone.",
};

const LABEL_OVERRIDE: Record<string, string> = { "wifi.encryption": "Security" };
const SECURITY: Record<string, string> = { WPA: "WPA / WPA2 / WPA3", WEP: "WEP", nopass: "No password" };

export default function ContentPanel({
  type,
  fields,
  setField,
  errors,
  visible,
  onType,
  paidLocked,
}: {
  type: QrType;
  fields: Fields;
  setField: (k: string, v: string) => void;
  errors: FieldErrors;
  /** only errors for fields the person has touched (or all after an export/save attempt) */
  visible: (k: string) => boolean;
  onType: (t: QrType) => void;
  paidLocked: boolean;
}) {
  const [showPw, setShowPw] = useState(false);
  const err = (k: string) => (visible(k) ? errors[k] ?? null : null);

  return (
    <div>
      <SelectField
        id="qr-type"
        label="Type"
        value={type}
        onChange={(e) => onType(e.target.value as QrType)}
        help={TYPE_HELP[type]}
      >
        {QR_TYPES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
            {!t.basic && paidLocked ? " — Pro" : ""}
          </option>
        ))}
      </SelectField>

      {FIELD_DEFS[type].map((d) => {
        const id = `f-${d.key}`;
        const e = err(d.key);
        const extra = EXTRA[`${type}.${d.key}`] ?? {};
        const label = LABEL_OVERRIDE[`${type}.${d.key}`] ?? d.label;
        const desc = e ? `${id}-err` : extra.help ? `${id}-help` : undefined;
        const common = { id, "aria-invalid": e ? true : undefined, "aria-describedby": desc } as const;
        let control;
        if (d.kind === "textarea") {
          control = (
            <textarea {...common} className={`${controlClass} min-h-28 resize-y`} rows={4} value={fields[d.key] ?? ""} onChange={(ev) => setField(d.key, ev.target.value)} />
          );
        } else if (d.kind === "select") {
          control = (
            <select {...common} className={`${controlClass} bg-surface`} value={fields[d.key] ?? d.options![0]} onChange={(ev) => setField(d.key, ev.target.value)}>
              {d.options!.map((o) => (
                <option key={o} value={o}>
                  {SECURITY[o] ?? o}
                </option>
              ))}
            </select>
          );
        } else if (d.kind === "checkbox") {
          return (
            <div key={d.key} className="mb-6 flex min-h-12 items-center gap-3">
              <input id={id} type="checkbox" className="size-6" checked={fields[d.key] === "true"} onChange={(ev) => setField(d.key, String(ev.target.checked))} />
              <label htmlFor={id}>{label}</label>
            </div>
          );
        } else if (type === "wifi" && d.key === "password") {
          const off = (fields.encryption ?? "WPA") === "nopass";
          control = (
            <div className="flex gap-2">
              <input
                {...common}
                className={controlClass}
                type={showPw ? "text" : "password"}
                autoComplete="off"
                disabled={off}
                value={off ? "" : fields[d.key] ?? ""}
                onChange={(ev) => setField(d.key, ev.target.value)}
              />
              <button
                type="button"
                aria-pressed={showPw}
                disabled={off}
                onClick={() => setShowPw((v) => !v)}
                className="min-h-12 shrink-0 rounded-control border border-control-border px-4 text-sm font-medium disabled:bg-disabled disabled:text-muted"
              >
                {showPw ? "Hide" : "Show"}
              </button>
            </div>
          );
        } else {
          control = (
            <input
              {...common}
              className={controlClass}
              type={extra.type ?? "text"}
              inputMode={extra.inputMode}
              autoComplete={extra.autoComplete ?? "off"}
              placeholder={d.placeholder}
              value={fields[d.key] ?? ""}
              onChange={(ev) => setField(d.key, ev.target.value)}
            />
          );
        }
        return (
          <div key={d.key} className="mb-6">
            <label htmlFor={id} className="mb-2 block text-sm font-medium">
              {label}
            </label>
            {control}
            {e ? (
              <p id={`${id}-err`} className="mt-2 text-[13px] text-danger">
                {e}
              </p>
            ) : extra.help ? (
              <p id={`${id}-help`} className="mt-2 text-[13px] text-muted">
                {extra.help}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
