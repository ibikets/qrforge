"use client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Dialog from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { controlClass } from "@/components/ui/Field";
import { validateContent } from "@/lib/qr-validation";
import type { Fields, QrType } from "@/lib/qr";
import { renderSvg, sanitizeStyle, svgDataUrl } from "@/lib/qr-render";
import {
  hasContent,
  isSensitive,
  saveDraft,
  setReturnIntent,
  type Draft,
} from "@/lib/qr-draft";

type Quick = Extract<QrType, "url" | "text" | "email">;
const TABS: { id: Quick; label: string }[] = [
  { id: "url", label: "Website" },
  { id: "text", label: "Text" },
  { id: "email", label: "Email" },
];
const INPUTS: Record<
  Quick,
  {
    key: string;
    label: string;
    placeholder?: string;
    area?: boolean;
    optional?: boolean;
  }[]
> = {
  url: [
    { key: "url", label: "Website address", placeholder: "example.com/menu" },
  ],
  text: [{ key: "text", label: "Text", area: true }],
  email: [
    { key: "to", label: "Email address", placeholder: "hello@example.com" },
    { key: "subject", label: "Subject (optional)", optional: true },
  ],
};
const STYLE = sanitizeStyle(undefined);

/**
 * Quick start. It uses the same validation and renderer as the editor, and hands the details to /create through the
 * same short-lived, same-tab draft (only an opaque id is in the address). Nothing is sent to a server from here.
 */
export default function Workbench({
  cta,
  freeNote,
}: {
  cta: string;
  freeNote: string;
}) {
  const router = useRouter();
  const [type, setType] = useState<Quick>("url");
  const [vals, setVals] = useState<Record<Quick, Fields>>({
    url: {},
    text: {},
    email: {},
  });
  const [attempted, setAttempted] = useState(false);
  const [leave, setLeave] = useState<null | { failed: boolean }>(null);
  const [note, setNote] = useState<string | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const fields = vals[type];
  const v = useMemo(() => validateContent(type, fields), [type, fields]);
  const preview = useMemo(
    () => (v.ok ? svgDataUrl(renderSvg(v.payload, STYLE, 240)) : null),
    [v],
  );
  const touchedAny = hasContent({
    type,
    fields,
    name: "",
    fg: "",
    bg: "",
    dots: "square",
    size: 512,
    format: "png",
    logo: null,
    logoName: null,
  });

  const draft = (): Draft => ({
    type,
    fields,
    name: "",
    fg: "#111111",
    bg: "#ffffff",
    dots: "square",
    size: 512,
    format: "png",
    logo: null,
    logoName: null,
  });
  const go = (id: string | null) => {
    if (id) setReturnIntent(`/create?draft=${id}`);
    router.push(id ? `/create?draft=${id}` : "/create");
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.ok) {
      setAttempted(true);
      const first = document.getElementById(`wb-${v.first}`);
      first?.focus();
      return;
    }
    setNote(null);
    const d = draft();
    if (isSensitive(d)) return setLeave({ failed: false }); // e-mail details need consent before they are kept
    const id = saveDraft(d);
    if (!id) return setLeave({ failed: true });
    go(id);
  }

  function onTabKey(e: React.KeyboardEvent, i: number) {
    const to =
      e.key === "ArrowRight"
        ? (i + 1) % 3
        : e.key === "ArrowLeft"
          ? (i + 2) % 3
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? 2
              : -1;
    if (to < 0) return;
    e.preventDefault();
    setType(TABS[to].id);
    setAttempted(false);
    tabRefs.current[TABS[to].id]?.focus();
  }

  const err = (k: string) => (attempted && !v.ok ? v.errors[k] : undefined);

  return (
    <section
      aria-labelledby="wb-h"
      className="mx-auto grid max-w-[1100px] gap-8 rounded-panel bg-soft p-5 sm:p-8 min-[900px]:grid-cols-[1fr_1px_minmax(0,320px)] min-[900px]:gap-10"
    >
      <div>
        <h2 id="wb-h" className="sr-only">
          Make a QR code
        </h2>
        <div
          role="tablist"
          aria-label="Type of code"
          className="mb-6 grid grid-cols-3 gap-3"
        >
          {TABS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              role="tab"
              id={`wb-tab-${t.id}`}
              aria-selected={type === t.id}
              aria-controls="wb-panel"
              tabIndex={type === t.id ? 0 : -1}
              onClick={() => {
                setType(t.id);
                setAttempted(false);
              }}
              onKeyDown={(e) => onTabKey(e, i)}
              className={`min-h-12 rounded-control border text-base font-medium ${type === t.id ? "border-transparent bg-brand text-white" : "border-divider bg-transparent text-brand hover:bg-surface"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <form
          id="wb-panel"
          role="tabpanel"
          aria-labelledby={`wb-tab-${type}`}
          onSubmit={submit}
          noValidate
        >
          {INPUTS[type].map((f) => {
            const id = `wb-${f.key}`;
            const e = err(f.key);
            const common = {
              id,
              value: fields[f.key] ?? "",
              placeholder: f.placeholder,
              "aria-invalid": e ? true : undefined,
              "aria-describedby": e ? `${id}-err` : undefined,
              className: controlClass,
              onChange: (
                ev: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>,
              ) =>
                setVals((s) => ({
                  ...s,
                  [type]: { ...s[type], [f.key]: ev.target.value },
                })),
            };
            return (
              <div key={f.key} className="mb-5">
                <label htmlFor={id} className="mb-2 block text-sm font-medium">
                  {f.label}
                </label>
                {f.area ? (
                  <textarea rows={3} maxLength={1000} {...common} />
                ) : (
                  <input
                    type={f.key === "to" ? "email" : "text"}
                    inputMode={f.key === "to" ? "email" : undefined}
                    autoComplete="off"
                    maxLength={500}
                    {...common}
                  />
                )}
                {e ? (
                  <p id={`${id}-err`} className="mt-2 text-[13px] text-danger">
                    {e}
                  </p>
                ) : null}
              </div>
            );
          })}
          <Button type="submit" className="w-full">
            {cta}
          </Button>
          {note ? (
            <p role="status" className="mt-3 text-sm text-muted">
              {note}
            </p>
          ) : null}
        </form>
      </div>
      <div aria-hidden className="hidden bg-divider min-[900px]:block" />
      <div className="text-center">
        <h3 className="mb-4 text-base font-semibold">QR code preview</h3>
        <div
          className="mx-auto grid aspect-square w-full max-w-[240px] place-items-center bg-white p-3"
          role="img"
          aria-label={
            preview
              ? "Preview of your QR code"
              : "Your QR code will appear here"
          }
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt=""
              width={216}
              height={216}
              className="block size-full"
            />
          ) : (
            <p className="px-4 text-sm text-muted">
              {touchedAny
                ? "Finish the details to see your code."
                : "Your code appears here as you type."}
            </p>
          )}
        </div>
        <p className="mt-4 text-[13px] text-muted">{freeNote}</p>
      </div>

      <Dialog
        open={leave !== null}
        onClose={() => setLeave(null)}
        title={
          leave?.failed
            ? "We couldn’t keep your draft"
            : "Keep this draft in this tab?"
        }
      >
        {leave?.failed ? (
          <p className="mb-6 text-muted">
            Your browser would not store the draft. Continue and enter your
            details again on the next page.
          </p>
        ) : (
          <p className="mb-6 text-muted">
            Keep these details in this tab for 30 minutes so you can continue on
            the next page? They stay in this browser tab only and are cleared
            after you continue or save.
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          {!leave?.failed ? (
            <Button
              onClick={() => {
                const id = saveDraft(draft());
                setLeave(null);
                if (!id) return setLeave({ failed: true });
                go(id);
              }}
            >
              Keep draft and continue
            </Button>
          ) : null}
          <Button
            variant="secondary"
            onClick={() => {
              setLeave(null);
              go(null);
            }}
          >
            {leave?.failed ? "Continue anyway" : "Continue without keeping"}
          </Button>
          <Button variant="ghost" data-autofocus onClick={() => setLeave(null)}>
            Stay here
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
