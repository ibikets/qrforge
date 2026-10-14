import { emailType, rowsOf, socialUrl, telType, vEsc, vcardKeys } from "@/lib/qr-contact";

export type QrType =
  | "url"
  | "text"
  | "email"
  | "phone"
  | "sms"
  | "whatsapp"
  | "wifi"
  | "vcard";

export const QR_TYPES: { id: QrType; label: string; basic: boolean }[] = [
  { id: "url", label: "Website URL", basic: true },
  { id: "text", label: "Plain text", basic: true },
  { id: "email", label: "Email", basic: true },
  { id: "phone", label: "Phone", basic: false },
  { id: "sms", label: "SMS", basic: false },
  { id: "whatsapp", label: "WhatsApp", basic: false },
  { id: "wifi", label: "WiFi", basic: false },
  { id: "vcard", label: "Contact (vCard)", basic: false },
];

export type Fields = Record<string, string>;

const esc = (s: string) => s.replace(/([\\;,:"])/g, "\\$1");
const digits = (s: string) => s.replace(/[^\d]/g, "");

export function buildPayload(type: QrType, f: Fields): string {
  switch (type) {
    case "url": {
      const u = (f.url ?? "").trim();
      if (!u) return "";
      return /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`;
    }
    case "text":
      return f.text ?? "";
    case "email": {
      if (!f.to) return "";
      const q = new URLSearchParams();
      if (f.subject) q.set("subject", f.subject);
      if (f.body) q.set("body", f.body);
      const qs = q.toString().replace(/\+/g, "%20");
      return `mailto:${f.to}${qs ? `?${qs}` : ""}`;
    }
    case "phone":
      return f.phone ? `tel:${f.phone.replace(/\s/g, "")}` : "";
    case "sms":
      return f.phone ? `SMSTO:${f.phone.replace(/\s/g, "")}:${f.message ?? ""}` : "";
    case "whatsapp": {
      const n = digits(f.phone ?? "");
      if (!n) return "";
      return `https://wa.me/${n}${f.message ? `?text=${encodeURIComponent(f.message)}` : ""}`;
    }
    case "wifi": {
      if (!f.ssid) return "";
      const enc = f.encryption || "WPA";
      const pass = enc === "nopass" ? "" : `P:${esc(f.password ?? "")};`;
      return `WIFI:T:${enc};S:${esc(f.ssid)};${pass}H:${f.hidden === "true"};;`;
    }
    case "vcard": {
      if (!f.firstName && !f.lastName) return "";
      const lines = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `N:${vEsc(f.lastName ?? "")};${vEsc(f.firstName ?? "")};;;`,
        `FN:${vEsc([f.firstName, f.lastName].filter(Boolean).join(" "))}`,
        f.org ? `ORG:${vEsc(f.org)}` : "",
        f.title ? `TITLE:${vEsc(f.title)}` : "",
      ];
      // Repeated TEL / EMAIL / URL properties are standard in vCard 3.0 (RFC 2426). Empty rows are skipped.
      for (const r of rowsOf(f, "phone")) if (r.value.trim()) lines.push(`TEL;TYPE=${telType(r.type)}:${r.value.trim()}`);
      for (const r of rowsOf(f, "email")) if (r.value.trim()) lines.push(`EMAIL;TYPE=${emailType(r.type)}:${r.value.trim()}`);
      for (const r of rowsOf(f, "website")) if (r.value.trim()) lines.push(`URL:${/^[a-z][a-z0-9+.-]*:/i.test(r.value.trim()) ? r.value.trim() : `https://${r.value.trim()}`}`);
      // Social profiles are written as plain URL properties: every contacts app reads those, unlike X-SOCIALPROFILE.
      for (const r of rowsOf(f, "social")) {
        const u = socialUrl(r.type, r.value);
        if (u) lines.push(`URL:${u}`);
      }
      lines.push("END:VCARD");
      return lines.filter(Boolean).join("\n");
    }
  }
}

// Field definitions used to render the form for each type
export const FIELD_DEFS: Record<
  QrType,
  { key: string; label: string; placeholder?: string; kind?: "text" | "textarea" | "select" | "checkbox"; options?: string[] }[]
> = {
  url: [{ key: "url", label: "Website address", placeholder: "example.com" }],
  text: [{ key: "text", label: "Text", kind: "textarea" }],
  email: [
    { key: "to", label: "Email address", placeholder: "hello@example.com" },
    { key: "subject", label: "Subject" },
    { key: "body", label: "Message", kind: "textarea" },
  ],
  phone: [{ key: "phone", label: "Phone number", placeholder: "+234 800 000 0000" }],
  sms: [
    { key: "phone", label: "Phone number", placeholder: "+234 800 000 0000" },
    { key: "message", label: "Message", kind: "textarea" },
  ],
  whatsapp: [
    { key: "phone", label: "WhatsApp number (with country code)", placeholder: "2348000000000" },
    { key: "message", label: "Pre-filled message", kind: "textarea" },
  ],
  wifi: [
    { key: "ssid", label: "Network name (SSID)" },
    { key: "password", label: "Password" },
    { key: "encryption", label: "Security", kind: "select", options: ["WPA", "WEP", "nopass"] },
    { key: "hidden", label: "Hidden network", kind: "checkbox" },
  ],
  // Phone, email, website and social rows are repeatable and live in lib/qr-contact.ts
  vcard: [
    { key: "firstName", label: "First name" },
    { key: "lastName", label: "Last name" },
    { key: "org", label: "Company" },
    { key: "title", label: "Job title" },
  ],
};

/** Keys a saved record of this type may carry (drops anything else before saving). */
export function allowedKeys(type: QrType): Set<string> {
  return type === "vcard" ? vcardKeys() : new Set(FIELD_DEFS[type].map((d) => d.key));
}
