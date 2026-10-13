export type PlanId = "free" | "pro" | "business";

export const PLANS: Record<
  PlanId,
  {
    name: string;
    priceNgn: number; // monthly, in Naira
    blurb: string;
    features: string[];
    // capabilities enforced in the generator
    types: "basic" | "all";
    formats: ("png" | "svg" | "pdf")[];
    logo: boolean;
    maxSize: number;
    maxSaved: number;
  }
> = {
  free: {
    name: "Free",
    priceNgn: 0,
    blurb: "For trying things out",
    features: ["URL, text and email QR codes", "PNG download (up to 512px)", "Custom colours", "Save up to 3 codes to your account"],
    types: "basic",
    formats: ["png"],
    logo: false,
    maxSize: 512,
    maxSaved: 3,
  },
  pro: {
    name: "Pro",
    priceNgn: 3500,
    blurb: "For individuals and small teams",
    features: [
      "All QR types: WiFi, vCard, WhatsApp, SMS, phone",
      "PNG, SVG and PDF downloads",
      "Logo in the centre",
      "High-resolution up to 2048px",
      "Save up to 100 codes",
    ],
    types: "all",
    formats: ["png", "svg", "pdf"],
    logo: true,
    maxSize: 2048,
    maxSaved: 100,
  },
  business: {
    name: "Business",
    priceNgn: 9500,
    blurb: "For agencies and heavy use",
    features: ["Everything in Pro", "Up to 4096px print-ready files",
      "Save up to 1,000 codes", "Priority support"],
    types: "all",
    formats: ["png", "svg", "pdf"],
    logo: true,
    maxSize: 4096,
    maxSaved: 1000,
  },
};

export const PAID_PLANS: PlanId[] = ["pro", "business"];

/** Naira display, e.g. 3500 -> "₦3,500" (fixed locale so server and browser agree). */
export const formatNaira = (n: number) => `₦${n.toLocaleString("en-US")}`;
