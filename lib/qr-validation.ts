import QRCode from "qrcode";
import { buildPayload, type Fields, type QrType } from "@/lib/qr";

export type FieldErrors = Record<string, string>;
export type Validation =
  | { ok: true; payload: string }
  | { ok: false; errors: FieldErrors; first: string };

const MAX_FIELD = 5000;
const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const PHONE_CHARS = /^\+?[0-9 ()\-.]+$/;

/** Hostname must be localhost, an IPv4 address, or a dotted name with an alphabetic TLD. */
function validHost(host: string) {
  if (host === "localhost") return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host.split(".").every((n) => Number(n) <= 255);
  return /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(host);
}

/** Returns an error message, or null when the address is a usable http(s) destination. */
export function urlError(raw: string): string | null {
  const v = raw.trim();
  if (!v) return "Enter a website address, for example https://example.com.";
  if (/\s/.test(v)) return "Website addresses cannot contain spaces.";
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(v);
  const candidate = hasScheme && !/^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : hasScheme ? v : `https://${v}`;
  let u: URL;
  try {
    u = new URL(candidate);
  } catch {
    return "Enter a valid website address, for example https://example.com.";
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "Use a website address that starts with http:// or https://.";
  if (!validHost(u.hostname)) return "Enter a valid website address, for example https://example.com.";
  return null;
}

const digitsOnly = (s: string) => s.replace(/\D/g, "");

function phoneError(v: string, label: string, required = true): string | null {
  const t = v.trim();
  if (!t) return required ? `Enter a ${label}.` : null;
  if (!PHONE_CHARS.test(t)) return `${label[0].toUpperCase()}${label.slice(1)} can only contain digits, spaces, + ( ) - and .`;
  const n = digitsOnly(t).length;
  if (n < 7 || n > 15) return "Use 7 to 15 digits, including the country code.";
  return null;
}

/** Shared by the browser editor and the API routes so both agree on what is exportable. */
export function validateContent(type: QrType, input: unknown): Validation {
  const f: Fields = {};
  const errors: FieldErrors = {};
  const src = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(src)) {
    if (typeof v !== "string") {
      errors[k] = "Invalid value.";
      continue;
    }
    if (v.length > MAX_FIELD) errors[k] = "This is too long.";
    f[k] = v;
  }
  const multiline = new Set(["text", "body", "message"]);
  for (const [k, v] of Object.entries(f)) if (!multiline.has(k) && CONTROL.test(v)) errors[k] = "Remove line breaks and control characters.";

  const get = (k: string) => (f[k] ?? "").trim();
  const need = (k: string, msg: string) => {
    if (!get(k) && !errors[k]) errors[k] = msg;
  };

  switch (type) {
    case "url": {
      const e = urlError(f.url ?? "");
      if (e && !errors.url) errors.url = e;
      break;
    }
    case "text":
      if (!(f.text ?? "").trim()) errors.text = "Enter the text people should see.";
      break;
    case "email":
      if (!get("to")) errors.to = "Enter an email address.";
      else if (!EMAIL.test(get("to"))) errors.to = "Enter a valid email address, for example hello@example.com.";
      break;
    case "phone": {
      const e = phoneError(f.phone ?? "", "phone number");
      if (e) errors.phone = e;
      break;
    }
    case "sms": {
      const e = phoneError(f.phone ?? "", "phone number");
      if (e) errors.phone = e;
      break;
    }
    case "whatsapp": {
      const e = phoneError(f.phone ?? "", "WhatsApp number");
      if (e) errors.phone = e;
      break;
    }
    case "wifi": {
      need("ssid", "Enter the network name.");
      const enc = f.encryption || "WPA";
      if (!["WPA", "WEP", "nopass"].includes(enc)) errors.encryption = "Choose a security type.";
      if (get("ssid").length > 32) errors.ssid = "Network names are 32 characters or fewer.";
      if (enc !== "nopass") {
        const pw = f.password ?? "";
        if (!pw) errors.password = "Enter the network password, or choose No password.";
        else if (enc === "WPA" && (pw.length < 8 || pw.length > 63)) errors.password = "WPA passwords are 8 to 63 characters.";
      }
      break;
    }
    case "vcard": {
      if (!get("firstName") && !get("lastName")) errors.firstName = "Enter at least a first or last name.";
      for (const k of ["firstName", "lastName", "org", "title"]) if (/[;]/.test(f[k] ?? "")) errors[k] = "Remove semicolons.";
      if (get("email") && !EMAIL.test(get("email"))) errors.email = "Enter a valid email address.";
      const pe = phoneError(f.phone ?? "", "phone number", false);
      if (pe) errors.phone = pe;
      if (get("website")) {
        const we = urlError(f.website);
        if (we) errors.website = we;
      }
      break;
    }
  }

  const keys = Object.keys(errors);
  if (keys.length) return { ok: false, errors, first: keys[0] };

  const payload = buildPayload(type, f);
  if (!payload) return { ok: false, errors: { _: "Fill in the details first." }, first: "_" };
  try {
    QRCode.create(payload, { errorCorrectionLevel: "H" });
  } catch {
    const key = type === "text" ? "text" : type === "url" ? "url" : Object.keys(f)[0] ?? "_";
    return { ok: false, errors: { [key]: "That is too much data for one QR code. Shorten it." }, first: key };
  }
  return { ok: true, payload };
}

/** Same sanitising the downloader has always used; falls back to "qrcode". */
export function safeFileBase(name: unknown): string {
  const s = String(name ?? "")
    .trim()
    .replace(/[^\w-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return s || "qrcode";
}

/** Rough WCAG contrast ratio, used only for a conservative "may be hard to scan" hint. */
export function contrastWarning(fg: string, bg: string): boolean {
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const a = lum(fg);
  const b = lum(bg);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return ratio < 4 || a > b;
}
