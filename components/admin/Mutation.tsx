"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import Dialog from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { controlClass } from "@/components/ui/Field";

type Phase = { kind: "idle" } | { kind: "pending" } | { kind: "done"; message: string } | { kind: "error"; message: string; code?: string; field?: string };

async function send(endpoint: string, payload: unknown): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  try {
    const res = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), credentials: "same-origin" });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, json };
  } catch {
    return { ok: false, status: 0, json: { error: "Could not reach the server. Nothing was confirmed; reload and check before retrying." } };
  }
}

function Outcome({ phase }: { phase: Phase }) {
  if (phase.kind === "error")
    return (
      <p role="alert" className="mt-3 text-sm text-danger">
        {phase.message}
        {phase.code === "reauth_required" ? (
          <>
            {" "}
            <a href="/login?next=/admin" className="font-medium underline">
              Sign in again
            </a>
          </>
        ) : null}
        {phase.code === "mfa_required" ? (
          <>
            {" "}
            <a href="/admin" className="font-medium underline">
              Complete multi-factor sign-in
            </a>
          </>
        ) : null}
      </p>
    );
  if (phase.kind === "pending")
    return (
      <p role="status" className="mt-3 text-sm text-muted">
        Applying… not confirmed yet.
      </p>
    );
  if (phase.kind === "done")
    return (
      <p role="status" className="mt-3 text-sm text-brand">
        {phase.message}
      </p>
    );
  return null;
}

/**
 * A consequential action behind a review dialog: names the exact target and effect, asks for a reason, puts safe Cancel first,
 * blocks double submission, and reports success only after the server confirms it.
 */
export function ActionButton({
  endpoint,
  payload,
  label,
  title,
  effect,
  variant = "secondary",
  reason = true,
  confirmLabel,
  disabledReason,
  className = "",
}: {
  endpoint: string;
  payload: Record<string, unknown>;
  label: string;
  title: string;
  effect: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  reason?: boolean;
  confirmLabel?: string;
  disabledReason?: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const busy = useRef(false);

  async function confirm() {
    if (busy.current) return;
    if (reason && why.trim().length < 5) return setPhase({ kind: "error", message: "Give a reason of at least 5 characters.", field: "reason" });
    busy.current = true;
    setPhase({ kind: "pending" });
    const r = await send(endpoint, { ...payload, ...(reason ? { reason: why.trim() } : {}) });
    busy.current = false;
    if (r.ok) {
      setPhase({ kind: "done", message: "Confirmed by the server." });
      router.refresh();
      setTimeout(() => setOpen(false), 700);
    } else {
      setPhase({ kind: "error", message: String(r.json.error ?? "Request failed."), code: r.json.code as string | undefined });
    }
  }

  return (
    <>
      <Button variant={variant} className={className} disabled={Boolean(disabledReason)} title={disabledReason} onClick={() => { setPhase({ kind: "idle" }); setOpen(true); }}>
        {label}
      </Button>
      {disabledReason ? <span className="sr-only"> ({disabledReason})</span> : null}
      <Dialog open={open} onClose={() => setOpen(false)} title={title}>
        <div className="mb-4 text-muted">{effect}</div>
        {reason ? (
          <div className="mb-4">
            <label htmlFor="act-reason" className="mb-2 block text-sm font-medium">
              Reason (kept in the audit log)
            </label>
            <textarea id="act-reason" className={`${controlClass} min-h-24`} value={why} onChange={(e) => setWhy(e.target.value)} maxLength={500} aria-invalid={phase.kind === "error" && phase.field === "reason" ? true : undefined} />
          </div>
        ) : null}
        <Outcome phase={phase} />
        <div className="mt-5 flex flex-wrap gap-3">
          <Button variant="secondary" data-autofocus onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant={variant === "danger" ? "danger" : "primary"} disabled={phase.kind === "pending" || phase.kind === "done"} onClick={confirm}>
            {phase.kind === "pending" ? "Applying…" : (confirmLabel ?? label)}
          </Button>
        </div>
      </Dialog>
    </>
  );
}

export type FieldSpec = {
  name: string;
  label: string;
  type?: "text" | "textarea" | "number" | "select" | "checkbox" | "checkboxes" | "datetime-local" | "email" | "url";
  options?: { value: string; label: string }[];
  help?: string;
  required?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  rows?: number;
};

/** Generic editor form. Keeps the user's input on any failure; success is shown only after the server confirms. */
export function EditorForm({
  endpoint,
  fields,
  initial = {},
  extra = {},
  submitLabel = "Save",
  reason = true,
  disabledReason,
  onDoneMessage = "Saved.",
  resetOnDone = false,
}: {
  endpoint: string;
  fields: FieldSpec[];
  initial?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  submitLabel?: string;
  reason?: boolean;
  disabledReason?: string;
  onDoneMessage?: string;
  resetOnDone?: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, unknown>>(initial);
  const [why, setWhy] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [dirty, setDirty] = useState(false);
  const busy = useRef(false);
  const set = (k: string, v: unknown) => {
    setValues((s) => ({ ...s, [k]: v }));
    setDirty(true);
    if (phase.kind === "done") setPhase({ kind: "idle" });
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy.current || disabledReason) return;
    for (const f of fields) {
      if (f.required && (values[f.name] === undefined || values[f.name] === "" || values[f.name] === null)) {
        setPhase({ kind: "error", message: `${f.label} is required.`, field: f.name });
        document.getElementById(`ef-${f.name}`)?.focus();
        return;
      }
    }
    if (reason && why.trim().length < 5) {
      setPhase({ kind: "error", message: "Give a reason of at least 5 characters.", field: "reason" });
      document.getElementById("ef-reason")?.focus();
      return;
    }
    busy.current = true;
    setPhase({ kind: "pending" });
    const r = await send(endpoint, { ...extra, ...values, ...(reason ? { reason: why.trim() } : {}) });
    busy.current = false;
    if (r.ok) {
      setPhase({ kind: "done", message: onDoneMessage });
      setDirty(false);
      if (resetOnDone) { setValues(initial); setWhy(""); }
      router.refresh();
    } else {
      const field = r.json.field as string | undefined;
      setPhase({ kind: "error", message: String(r.json.error ?? "Request failed."), code: r.json.code as string | undefined, field });
      if (field) document.getElementById(`ef-${field}`)?.focus();
    }
  }

  return (
    <form onSubmit={submit} noValidate aria-busy={phase.kind === "pending"}>
      {fields.map((f) => {
        const id = `ef-${f.name}`;
        const err = phase.kind === "error" && phase.field === f.name ? phase.message : null;
        const common = { id, "aria-invalid": err ? true : undefined, "aria-describedby": err ? `${id}-err` : f.help ? `${id}-help` : undefined, disabled: Boolean(disabledReason) } as const;
        const v = values[f.name];
        return (
          <div key={f.name} className="mb-5">
            {f.type === "checkbox" ? (
              <label className="flex items-start gap-3">
                <input type="checkbox" className="mt-1 size-5" checked={Boolean(v)} onChange={(e) => set(f.name, e.target.checked)} {...common} />
                <span className="text-sm font-medium">{f.label}</span>
              </label>
            ) : f.type === "checkboxes" ? (
              <fieldset>
                <legend className="mb-2 text-sm font-medium">{f.label}</legend>
                <div className="flex flex-wrap gap-4">
                  {f.options?.map((o) => {
                    const arr = Array.isArray(v) ? (v as string[]) : [];
                    return (
                      <label key={o.value} className="flex items-center gap-2">
                        <input type="checkbox" className="size-5" disabled={Boolean(disabledReason)} checked={arr.includes(o.value)} onChange={(e) => set(f.name, e.target.checked ? [...arr, o.value] : arr.filter((x) => x !== o.value))} />
                        <span className="text-sm">{o.label}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ) : (
              <>
                <label htmlFor={id} className="mb-2 block text-sm font-medium">
                  {f.label}
                  {f.required ? <span className="text-muted"> (required)</span> : null}
                </label>
                {f.type === "textarea" ? (
                  <textarea className={`${controlClass} resize-y`} rows={f.rows ?? 4} maxLength={f.maxLength} value={String(v ?? "")} onChange={(e) => set(f.name, e.target.value)} {...common} />
                ) : f.type === "select" ? (
                  <select className={`${controlClass} bg-surface`} value={String(v ?? "")} onChange={(e) => set(f.name, e.target.value)} {...common}>
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={controlClass}
                    type={f.type ?? "text"}
                    min={f.min}
                    max={f.max}
                    maxLength={f.maxLength}
                    value={String(v ?? "")}
                    onChange={(e) => set(f.name, f.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
                    {...common}
                  />
                )}
              </>
            )}
            {f.help && !err ? (
              <p id={`${id}-help`} className="mt-2 text-[13px] text-muted">
                {f.help}
              </p>
            ) : null}
            {err ? (
              <p id={`${id}-err`} className="mt-2 text-[13px] text-danger">
                {err}
              </p>
            ) : null}
          </div>
        );
      })}
      {reason ? (
        <div className="mb-5">
          <label htmlFor="ef-reason" className="mb-2 block text-sm font-medium">
            Reason (kept in the audit log)
          </label>
          <input id="ef-reason" className={controlClass} value={why} maxLength={500} onChange={(e) => { setWhy(e.target.value); setDirty(true); }} aria-invalid={phase.kind === "error" && phase.field === "reason" ? true : undefined} disabled={Boolean(disabledReason)} />
          {phase.kind === "error" && phase.field === "reason" ? <p className="mt-2 text-[13px] text-danger">{phase.message}</p> : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={phase.kind === "pending" || Boolean(disabledReason)} title={disabledReason}>
          {phase.kind === "pending" ? "Saving…" : submitLabel}
        </Button>
        {dirty && phase.kind === "idle" ? <span className="text-sm text-muted">Unsaved changes</span> : null}
      </div>
      {disabledReason ? <p className="mt-2 text-sm text-muted">{disabledReason}</p> : null}
      {phase.kind === "error" && !phase.field ? <Outcome phase={phase} /> : phase.kind !== "error" ? <Outcome phase={phase} /> : null}
    </form>
  );
}
