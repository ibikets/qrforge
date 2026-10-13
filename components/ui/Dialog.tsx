"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";

/** Native <dialog>: focus trapped by the browser, Esc closes, focus returns to the opener. */
export default function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement;
      d.showModal();
      // React's autoFocus runs before the dialog is shown, so focus the marked safe action explicitly
      d.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={() => {
        onClose();
        if (opener.current instanceof HTMLElement) opener.current.focus();
      }}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <h2 id={titleId} className="mb-3 text-2xl font-medium leading-snug">
        {title}
      </h2>
      {open ? children : null}
    </dialog>
  );
}
