"use client";
import { useEffect, useRef, useState } from "react";
import { GROUPS, GROUP_KEYS, MAX_ROWS, addRow, removeRow, rowsOf, type ContactGroup } from "@/lib/qr-contact";
import type { Fields } from "@/lib/qr";
import type { FieldErrors } from "@/lib/qr-validation";
import { controlClass } from "@/components/ui/Field";

const INPUT: Record<ContactGroup, { type: string; inputMode: "tel" | "email" | "url" | "text"; placeholder: string; singular: string }> = {
  phone: { type: "tel", inputMode: "tel", placeholder: "+234 800 000 0000", singular: "phone number" },
  email: { type: "email", inputMode: "email", placeholder: "name@example.com", singular: "email address" },
  website: { type: "text", inputMode: "url", placeholder: "example.com", singular: "website" },
  social: { type: "text", inputMode: "text", placeholder: "handle or https:// address", singular: "social profile" },
};

const btn = "inline-flex size-12 shrink-0 items-center justify-center rounded-control border text-xl leading-none disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled disabled:text-muted";

/** Repeatable contact rows for the vCard type: phone, email, website, social. */
export default function ContactRows({
  fields,
  setField,
  setFields,
  errors,
  visible,
}: {
  fields: Fields;
  setField: (k: string, v: string) => void;
  setFields: (fn: (f: Fields) => Fields) => void;
  errors: FieldErrors;
  visible: (k: string) => boolean;
}) {
  const [note, setNote] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const err = (k: string) => (visible(k) ? errors[k] ?? null : null);
  // Focus is applied after React has committed the new rows, so it never races the render.
  const pending = useRef<string | null>(null);
  const focus = (id: string) => { pending.current = id; };
  useEffect(() => {
    if (pending.current) {
      document.getElementById(pending.current)?.focus();
      pending.current = null;
    }
  }, [fields]);

  return (
    <div ref={root}>
      {GROUP_KEYS.map((g) => {
        const def = GROUPS[g];
        const inp = INPUT[g];
        const rows = rowsOf(fields, g);
        const full = rows.length >= MAX_ROWS;
        return (
          <fieldset key={g} className="mb-6 min-w-0 border-0 p-0">
            <legend className="mb-2 text-sm font-medium">{def.label}</legend>
            {rows.map((r, idx) => {
              const e = err(r.key);
              const te = err(r.tKey);
              const label = `${def.label} ${idx + 1}`;
              const errId = `f-${r.key}-err`;
              return (
                <div key={r.key} className="mb-3">
                  <div className={`grid grid-cols-[minmax(0,1fr)_auto] gap-2 ${def.types.length ? "sm:grid-cols-[auto_minmax(0,1fr)_auto]" : ""}`}>
                    {def.types.length ? (
                      <select
                        aria-label={`${label} type`}
                        id={`f-${r.tKey}`}
                        aria-invalid={te ? true : undefined}
                        className={`${controlClass} col-span-2 bg-surface sm:col-span-1 sm:w-36`}
                        value={r.type}
                        onChange={(ev) => setField(r.tKey, ev.target.value)}
                      >
                        {def.types.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <input
                      id={`f-${r.key}`}
                      aria-label={label}
                      aria-invalid={e ? true : undefined}
                      aria-describedby={e ? errId : undefined}
                      className={controlClass}
                      type={inp.type}
                      inputMode={inp.inputMode}
                      autoComplete="off"
                      placeholder={g === "social" ? (r.type === "other" ? "https://…" : "handle, for example yourname") : inp.placeholder}
                      value={r.value}
                      onChange={(ev) => setField(r.key, ev.target.value)}
                    />
                    {idx === 0 ? (
                      <button
                        type="button"
                        id={`add-${g}`}
                        className={`${btn} border-brand text-brand hover:bg-soft`}
                        aria-label={`Add another ${inp.singular}`}
                        disabled={full}
                        onClick={() => {
                          const before = rowsOf(fields, g).length;
                          setFields((f) => addRow(f, g));
                          setNote(`${def.label} ${before + 1} added.`);
                          focus(`f-${g}_${before + 1}`);
                        }}
                      >
                        <span aria-hidden="true">+</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={`${btn} border-control-border text-ink hover:bg-soft`}
                        aria-label={`Remove ${label.toLowerCase()}`}
                        onClick={() => {
                          setFields((f) => removeRow(f, g, r.i));
                          setNote(`${label} removed.`);
                          focus(`add-${g}`);
                        }}
                      >
                        <span aria-hidden="true">×</span>
                      </button>
                    )}
                  </div>
                  {e || te ? (
                    <p id={errId} className="mt-2 text-[13px] text-danger">
                      {e ?? te}
                    </p>
                  ) : null}
                </div>
              );
            })}
            {full ? <p className="text-[13px] text-muted">You can add up to {MAX_ROWS} {def.plural}.</p> : null}
          </fieldset>
        );
      })}
      {errors.vcard_size ? (
        <p role="alert" className="mb-6 text-[13px] text-danger">
          {errors.vcard_size}
        </p>
      ) : null}
      <p className="sr-only" role="status" aria-live="polite">
        {note}
      </p>
    </div>
  );
}
