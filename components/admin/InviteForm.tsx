"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { EditorForm } from "@/components/admin/Mutation";
import { EXTRA_GRANTS, ROLE_LABEL, ROLES } from "@/lib/admin/permissions";

const GRANT_LABEL: Record<string, string> = {
  "content.publish": "Can publish landing content",
  "billing.adjust": "Can add plan days (up to 30)",
  "billing.refund_request": "Can request refunds",
  "plans.draft": "Can draft plan prices and offers",
};

export default function InviteForm() {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  return (
    <>
      <EditorForm
        endpoint="/api/admin/staff"
        extra={{ action: "invite" }}
        initial={{ email: "", role_choice: "support", grants: [] }}
        fields={[
          { name: "email", label: "Their email address", type: "email", required: true, help: "They must sign in with this exact address to accept." },
          { name: "role_choice", label: "Role", type: "select", options: ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] })) },
          { name: "grants", label: "Extra permissions (optional)", type: "checkboxes", options: EXTRA_GRANTS.map((g) => ({ value: g, label: GRANT_LABEL[g] })) },
        ]}
        submitLabel="Create invitation"
        onDone={(j) => { setLink(String(j.link ?? "")); setCopied(false); }}
        resetOnDone
      />
      {link ? (
        <div role="status" className="mt-5 rounded-control bg-soft p-4">
          <p className="mb-2 font-medium">Invitation link (shown once, valid for 3 days)</p>
          <p className="mb-3 break-all font-mono text-[13px]">{link}</p>
          <p className="mb-3 text-sm text-muted">Send it to the person yourself. It is not emailed from here. Anyone with this link who signs in as that email can join, so share it privately.</p>
          <Button variant="secondary" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); } }}>{copied ? "Copied" : "Copy link"}</Button>
        </div>
      ) : null}
    </>
  );
}
