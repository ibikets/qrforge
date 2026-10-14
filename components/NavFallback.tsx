import Logo from "@/components/Logo";

/** Shown while the session resolves: the logo only, so no wrong links flash. Uses no request data. */
export default function NavFallback() {
  return (
    <header className="flex items-center justify-between gap-6 border-b border-divider bg-surface px-5 py-4 sm:px-8">
      <Logo variant="horizontal" />
    </header>
  );
}
