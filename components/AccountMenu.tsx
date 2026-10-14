"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import {
  ChevronDownIcon,
  CreditCardIcon,
  LogOutIcon,
  UserIcon,
} from "@/components/ui/Icons";

/** Sign out, shared by the menu and the mobile list. Failure is reported, never swallowed. */
export function useSignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function signOut() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const { error } = await supabaseBrowser().auth.signOut();
      if (error) throw error;
      router.push("/");
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return { signOut, busy, failed };
}

const row =
  "flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-left text-[15px] font-medium text-ink no-underline hover:bg-soft focus-visible:bg-soft";

/** Round avatar button (photo placeholder) that opens "My account" and "Sign out". */
export default function AccountMenu({
  email,
  placement = "down",
}: {
  email: string;
  placement?: "down" | "up";
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const { signOut, busy, failed } = useSignOut();

  useEffect(() => {
    if (!open) return;
    const items = () =>
      Array.from(
        root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
      );
    items()[0]?.focus();
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      const list = items();
      const i = list.indexOf(document.activeElement as HTMLElement);
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        list[(i + 1) % list.length]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        list[(i - 1 + list.length) % list.length]?.focus();
      } else if (e.key === "Home") {
        e.preventDefault();
        list[0]?.focus();
      } else if (e.key === "End") {
        e.preventDefault();
        list[list.length - 1]?.focus();
      } else if (e.key === "Tab") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="Account menu"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 items-center gap-1 rounded-full pr-1 text-muted hover:text-ink"
      >
        <span className="grid size-10 place-items-center rounded-full border border-divider bg-soft text-brand">
          <UserIcon width={22} height={22} />
        </span>
        <ChevronDownIcon
          className={
            open ? "rotate-180 transition-transform" : "transition-transform"
          }
        />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Account"
          className={`absolute z-40 w-64 rounded-panel border border-divider bg-surface p-2 shadow-[0_8px_24px_rgba(32,41,35,0.12)] ${
            placement === "up"
              ? "bottom-full left-0 mb-2"
              : "right-0 top-full mt-2"
          }`}
        >
          <div className="px-3 pb-2 pt-1">
            <p className="text-[13px] text-muted">Signed in as</p>
            <p className="break-all text-sm font-medium text-ink">{email}</p>
          </div>
          <div className="my-1 border-t border-divider" role="separator" />
          <Link
            href="/account"
            role="menuitem"
            tabIndex={-1}
            className={row}
            onClick={() => setOpen(false)}
          >
            <UserIcon className="text-brand" />
            My account
          </Link>
          <Link
            href="/billing"
            role="menuitem"
            tabIndex={-1}
            className={row}
            onClick={() => setOpen(false)}
          >
            <CreditCardIcon className="text-brand" />
            Billing
          </Link>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled={busy}
            onClick={signOut}
            className={`${row} disabled:text-muted`}
          >
            <LogOutIcon className="text-brand" />
            {busy ? "Signing out…" : "Sign out"}
          </button>
          {failed ? (
            <p role="alert" className="px-3 pb-1 pt-2 text-[13px] text-danger">
              Could not sign out. Try again.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** The same two actions as full-width rows, for the mobile menu dialog. */
export function AccountRows({
  email,
  onNavigate,
}: {
  email: string;
  onNavigate: () => void;
}) {
  const { signOut, busy, failed } = useSignOut();
  return (
    <div className="mt-2 border-t border-divider pt-3">
      <p className="px-3 text-[13px] text-muted">Signed in as</p>
      <p className="mb-2 break-all px-3 text-sm font-medium text-ink">
        {email}
      </p>
      <Link href="/account" className={row} onClick={onNavigate}>
        <UserIcon className="text-brand" />
        My account
      </Link>
      <button
        type="button"
        disabled={busy}
        onClick={signOut}
        className={`${row} disabled:text-muted`}
      >
        <LogOutIcon className="text-brand" />
        {busy ? "Signing out…" : "Sign out"}
      </button>
      {failed ? (
        <p role="alert" className="px-3 pt-1 text-[13px] text-danger">
          Could not sign out. Try again.
        </p>
      ) : null}
    </div>
  );
}
