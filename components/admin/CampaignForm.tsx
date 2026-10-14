"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EditorForm } from "@/components/admin/Mutation";

type Initial = Record<string, unknown>;

export default function CampaignForm({ initial, id, version, targetsHint }: { initial: Initial; id?: string; version?: number; targetsHint?: string }) {
  const router = useRouter();
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [seed, setSeed] = useState(0);
  return (
    <>
      <EditorForm
        key={seed}
        endpoint="/api/admin/campaigns"
        extra={{ action: "save_draft", ...(id ? { id, version } : {}) }}
        initial={initial}
        submitLabel={id ? "Save draft" : "Create draft"}
        onDone={(j) => {
          setUnmatched((j.unmatched as string[]) ?? []);
          if (!id && typeof j.id === "string") router.push(`/admin/discounts/${j.id}`);
        }}
        fields={[
          { name: "name", label: "Name", required: true, maxLength: 80, help: "Internal. Customers see the notice text, not this name." },
          { name: "slug", label: "Reference", required: true, maxLength: 41, help: "Lower-case letters, numbers and hyphens. Recorded on each payment." },
          { name: "discount_kind", label: "Discount type", type: "select", options: [{ value: "percent", label: "Percentage off" }, { value: "fixed", label: "Fixed amount off (₦)" }] },
          { name: "percent", label: "Percentage off (1–90)", type: "number", min: 1, max: 90, help: "Used when the type is Percentage. Rounded to the nearest kobo." },
          { name: "fixed_naira", label: "Amount off (₦)", type: "number", min: 1, help: "Used when the type is Fixed amount. Must be less than the plan price." },
          { name: "plans", label: "Plans", type: "checkboxes", options: [{ value: "pro", label: "Pro" }, { value: "business", label: "Business" }] },
          { name: "audience", label: "Who can use it", type: "select", options: [{ value: "any", label: "Any signed-in customer" }, { value: "new_paid", label: "Customers who have never paid" }] },
          { name: "delivery", label: "How customers get it", type: "select", options: [{ value: "public", label: "Public: applies automatically and may be shown on the website" }, { value: "private", label: "Private: needs a code, never shown on the website" }, { value: "targeted", label: "Targeted: only the customers listed below" }] },
          { name: "banner_text", label: "Website notice (public offers only)", maxLength: 140, help: "Say who it is for and that it covers the first payment only. No countdowns or scarcity claims." },
          { name: "code", label: id ? "New code (leave blank to keep the current one)" : "Code (private offers)", maxLength: 32, help: "6–32 letters, numbers or hyphens. Only a fingerprint is stored, so it cannot be shown again." },
          { name: "target_emails", label: "Customer emails (targeted offers)", type: "textarea", rows: 3, help: targetsHint ?? "One per line or comma-separated. Each must already have an account." },
          { name: "starts_at", label: "Starts (Lagos time)", type: "datetime-local", required: true },
          { name: "ends_at", label: "Ends (Lagos time)", type: "datetime-local", required: true },
          { name: "total_limit", label: "Total uses (optional)", type: "number", min: 1, help: "Counted atomically, so the last slot cannot be taken twice." },
          { name: "per_customer_limit", label: "Uses per customer", type: "number", min: 1, max: 10, required: true },
          { name: "priority", label: "Priority (0–100)", type: "number", min: 0, max: 100, help: "If several offers apply, the highest priority wins. Offers never stack." },
          { name: "internal_reason", label: "Internal note", type: "textarea", rows: 2, maxLength: 500 },
        ]}
      />
      {unmatched.length ? <p role="status" className="mt-3 text-sm text-warning">No account found for: {unmatched.join(", ")}</p> : null}
      <button type="button" className="mt-3 text-sm font-medium text-brand underline" onClick={() => setSeed((n) => n + 1)}>Discard unsaved changes</button>
    </>
  );
}
