"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import Dialog from "@/components/ui/Dialog";
import AccountMenu, { AccountRows } from "@/components/AccountMenu";
import Logo from "@/components/Logo";
import IdleSignOut from "@/components/IdleSignOut";

const WORKSPACE = ["/create", "/codes", "/workspace", "/billing", "/account"];

type Item = { href: string; label: string };
const authed: Item[] = [
  { href: "/create", label: "Create" },
  { href: "/codes", label: "My codes" },
  { href: "/workspace/pages", label: "Pages" },
  { href: "/billing", label: "Billing" },
  { href: "/account", label: "Account" },
];
// Signed-in visitors on public pages (landing, pricing): no "Sign in"; Sign out is added by TopBar.
const signedInPublic: Item[] = [
  { href: "/create", label: "Create" },
  { href: "/codes", label: "My codes" },
  { href: "/pricing", label: "Pricing" },
];
const anon: Item[] = [
  { href: "/create", label: "Create" },
  { href: "/pricing", label: "Pricing" },
  { href: "/login", label: "Sign in" },
];

/** `email`: string = signed in, null = signed out, undefined = still resolving (renders the logo only, so no wrong links flash). */
export default function NavShell({
  email: resolved,
}: {
  email: string | null | undefined;
}) {
  const pending = resolved === undefined;
  const email = resolved ?? null;
  const path = usePathname() || "/";
  const [menu, setMenu] = useState(false);
  const rail =
    Boolean(email) &&
    WORKSPACE.some((p) => path === p || path.startsWith(p + "/"));
  const items = pending ? [] : email ? (rail ? authed : signedInPublic) : anon;
  const active = (h: string) => path === h || path.startsWith(h + "/");

  // The management area renders its own shell.
  if (path.startsWith("/admin") || path.startsWith("/p/")) return null;

  if (rail) {
    return (
      <>
        <IdleSignOut />
        {/* desktop rail */}
        <aside
          data-rail
          className="fixed inset-y-0 left-0 z-30 hidden w-54 flex-col gap-8 border-r border-divider bg-canvas px-6 py-8 min-[1000px]:flex"
        >
          <Logo variant="horizontal" className="self-start" />
          <nav aria-label="Workspace" className="grid gap-2.5">
            {authed.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                aria-current={active(i.href) ? "page" : undefined}
                className={`flex min-h-12 items-center rounded-control px-4 font-medium no-underline ${
                  active(i.href)
                    ? "bg-soft text-brand shadow-[inset_3px_0_var(--qrf-primary)]"
                    : "text-muted hover:text-ink"
                }`}
              >
                {i.label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto text-sm">
            <Link
              href="/pricing"
              className="mb-2 block px-1 font-medium text-brand no-underline hover:text-brand-hover"
            >
              View plans
            </Link>
            <div className="flex items-center gap-2 border-t border-divider pt-3">
              {email ? <AccountMenu email={email} placement="up" /> : null}
              <p
                className="min-w-0 break-words text-[13px] text-muted"
                title={email ?? undefined}
              >
                {email}
              </p>
            </div>
          </div>
        </aside>
        {/* below 1000px: compact top bar */}
        <TopBar
          items={authed}
          active={active}
          menu={menu}
          setMenu={setMenu}
          email={email}
          className="min-[1000px]:hidden"
        />
      </>
    );
  }
  return (
    <>
      {email ? <IdleSignOut /> : null}
      <TopBar
        items={items}
        active={active}
        menu={menu}
        setMenu={setMenu}
        email={email}
      />
    </>
  );
}

function TopBar({
  items,
  active,
  menu,
  setMenu,
  email,
  className = "",
}: {
  items: Item[];
  active: (h: string) => boolean;
  menu: boolean;
  setMenu: (v: boolean) => void;
  email: string | null;
  className?: string;
}) {
  const link = (i: Item) => (
    <Link
      key={i.href}
      href={i.href}
      aria-current={active(i.href) ? "page" : undefined}
      className={`text-sm no-underline ${active(i.href) ? "font-semibold text-brand" : "text-muted hover:text-ink"}`}
    >
      {i.label}
    </Link>
  );
  return (
    <header
      className={`flex items-center justify-between gap-6 border-b border-divider bg-surface px-5 py-4 sm:px-8 ${className}`}
    >
      <Logo variant="horizontal" />
      {items.length === 0 ? null : (
        <nav aria-label="Main" className="flex items-center gap-6">
          <div className="hidden items-center gap-6 sm:flex">
            {items.map(link)}
            {email ? <AccountMenu email={email} /> : null}
          </div>
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-control border border-brand px-3 text-base font-medium text-brand sm:hidden"
            aria-haspopup="dialog"
            onClick={() => setMenu(true)}
          >
            Menu
          </button>
        </nav>
      )}
      <Dialog open={menu} onClose={() => setMenu(false)} title="Navigation">
        <nav aria-label="Menu" className="grid gap-2">
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              onClick={() => setMenu(false)}
              aria-current={active(i.href) ? "page" : undefined}
              className={`flex min-h-12 items-center rounded-control px-4 font-medium no-underline ${active(i.href) ? "bg-soft text-brand" : "text-ink"}`}
            >
              {i.label}
            </Link>
          ))}
          {email ? (
            <AccountRows email={email} onNavigate={() => setMenu(false)} />
          ) : null}
        </nav>
        <button
          type="button"
          className="mt-4 min-h-12 w-full rounded-control border border-brand text-brand"
          onClick={() => setMenu(false)}
        >
          Close
        </button>
      </Dialog>
    </header>
  );
}
