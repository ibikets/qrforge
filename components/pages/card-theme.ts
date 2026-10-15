import type { CSSProperties } from "react";
import { ACCENTS } from "@/lib/pages/card";

/**
 * Scoped look of a published card / editor preview. Everything is driven by CSS variables set on the card's own <article>,
 * so nothing here can recolour the dashboard or any other screen. The customer's accent is the identity colour; the action
 * tones below are fixed, restrained pairs (glyph on pale tint, each at least 3:1 for the glyph and 4.5:1 for captions on white).
 */
export type AccentDef = (typeof ACCENTS)[number];
export const cardVars = (a: AccentDef): CSSProperties =>
  ({
    "--qc-accent": a.bg,
    "--qc-accent-deep": `color-mix(in srgb, ${a.bg} 72%, #000)`,
    "--qc-tint": `color-mix(in srgb, ${a.bg} 11%, #fff)`,
    "--qc-line": `color-mix(in srgb, ${a.bg} 16%, #e5e7eb)`,
  }) as CSSProperties;

export type Tone = "call" | "whatsapp" | "email" | "website" | "share";
/** fg = glyph colour, bg = chip tint. `call` follows the customer's accent. */
export const TONES: Record<Tone, { fg: string; bg: string }> = {
  call: { fg: "var(--qc-accent)", bg: "var(--qc-tint)" },
  whatsapp: { fg: "#0f7a69", bg: "#dcf6ee" },
  email: { fg: "#1d4ed8", bg: "#dbeafe" },
  website: { fg: "#6d28d9", bg: "#ede9fe" },
  share: { fg: "#b45309", bg: "#fef3c7" },
};
export const toneStyle = (t: Tone): CSSProperties => ({ color: TONES[t].fg, backgroundColor: TONES[t].bg });
export const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--qc-accent)]";
