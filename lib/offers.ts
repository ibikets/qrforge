import { createHash } from "node:crypto";

/** Offer codes are compared only by hash; the plain code is never stored. Normalised so case and spaces do not matter. */
export const normaliseOfferCode = (c: string) => c.trim().toUpperCase().replace(/\s+/g, "");
export const hashOfferCode = (c: string) => createHash("sha256").update("qrenuvi-offer:" + normaliseOfferCode(c)).digest("hex");
export const OFFER_CODE_RE = /^[A-Z0-9-]{6,32}$/;
