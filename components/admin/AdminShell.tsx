"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import Dialog from "@/components/ui/Dialog";
import AccountMenu from "@/components/AccountMenu";
import IdleSignOut from "@/components/IdleSignOut";
import { Logo } from "@/components/Logo";

export type NavItem = { href: string; label: string };

export default function AdminShell({ items, roleLabel, email, canSearch, children }: { items: NavItem[]; roleLabel: string; email: string; canSearch: boolean; children: ReactNode }) {
  const path = usePathname() || "/admin";
  const [menu, setMenu] = useState(false);
  const active = (h: string) => (h === "/admin" ? path === "/admin" : path === h || path.startsWith(h + "/"));
  const link = (i: NavItem, cls = "") => (
    <Link
      key={i.href}
      href={i.href}
      aria-current={active(i.href) ? "page" : undefined}
      onClick={() => setMenu(false)}
      className={`flex min-h-11 items-center rounded-control px-4 font-medium no-underline ${active(i.href) ? "bg-soft text-brand shadow-[inset_3px_0_var(--qrf-primary)]" : "text-muted hover:text-ink"} ${cls}`}
    >
      {i.label}
    </Link>
  );
  return (
    <>
      <IdleSignOut staff />
      <aside data-rail className="fixed inset-y-0 left-0 z-30 hidden w-54 flex-col gap-6 overflow-y-auto border-r border-divider bg-canvas px-4 py-6 min-[1000px]:flex">
        <Logo variant="horizontal" href="/admin" label="Qrenuvi management" className="self-start" />
        <nav aria-label="Management" className="grid gap-1">
          {items.map((i) => link(i))}
        </nav>
        <div className="mt-auto border-t border-divider pt-3">
          <p className="mb-2 px-1 text-[13px] text-muted">Role</p>
          <p className="mb-3 px-1 text-sm font-medium">{roleLabel}</p>
          <div className="flex items-center gap-2">
            <AccountMenu email={email} placement="up" accountHref="/admin/security" accountLabel="Security" staff />
            <p className="min-w-0 break-words text-[13px] text-muted">{email}</p>
          </div>
        </div>
      </aside>
      <header className="flex items-center justify-between gap-4 border-b border-divider bg-surface px-5 py-3 min-[1000px]:hidden">
        <Logo variant="horizontal" href="/admin" label="Qrenuvi management" />
        <button type="button" className="inline-flex min-h-11 items-center rounded-control border border-brand px-3 font-medium text-brand" aria-haspopup="dialog" onClick={() => setMenu(true)}>
          Menu
        </button>
        <Dialog open={menu} onClose={() => setMenu(false)} title="Management">
          <nav aria-label="Management menu" className="grid gap-1">
            {items.map((i) => link(i, "min-h-12"))}
          </nav>
          <p className="mt-3 px-1 text-[13px] text-muted">
            {roleLabel} · {email}
          </p>
          <button type="button" className="mt-4 min-h-12 w-full rounded-control border border-brand text-brand" onClick={() => setMenu(false)}>
            Close
          </button>
        </Dialog>
      </header>
      <div className="mx-auto max-w-[1280px] px-5 py-6 sm:px-10 sm:py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-divider pb-4">
          {canSearch ? (
            <form action="/admin/customers" role="search" className="flex min-w-0 flex-1 gap-2 sm:max-w-md">
              <label htmlFor="admin-search" className="sr-only">
                Search customers by email
              </label>
              <input id="admin-search" name="q" type="search" placeholder="Search customers by email" maxLength={80} className="min-h-11 min-w-0 flex-1 rounded-control border border-control-border bg-transparent px-3 text-base" />
              <button type="submit" className="min-h-11 rounded-control border border-brand px-4 font-medium text-brand">
                Search
              </button>
            </form>
          ) : (
            <span />
          )}
          <p className="text-sm text-muted">
            Signed in as <span className="font-medium text-ink">{roleLabel}</span>
          </p>
        </div>
        {children}
      </div>
    </>
  );
}
