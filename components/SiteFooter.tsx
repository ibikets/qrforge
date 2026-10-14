import { cacheLife } from "next/cache";
import Link from "next/link";
import { getLanding, getSiteSettings } from "@/lib/landing-data";

/** Verified in the project context: bitzpark.com is the Bitzpark Limited site (canonical, © line matches). */
const BITZPARK_URL = "https://bitzpark.com";

/** Cached so the year is part of the static shell; it refreshes within a day, so it rolls over on 1 January. */
async function Year() {
  "use cache";
  cacheLife("days");
  return <>{new Date().getFullYear()}</>;
}

export default async function SiteFooter() {
  const [settings, landing] = await Promise.all([
    getSiteSettings(),
    getLanding(),
  ]);
  // Only real, Owner-supplied links appear. Nothing is shown for a page that has not been set up.
  const links: { label: string; href: string; external?: boolean }[] = [
    ...(settings.terms_url
      ? [{ label: "Terms", href: settings.terms_url, external: true }]
      : []),
    ...(settings.privacy_url
      ? [{ label: "Privacy", href: settings.privacy_url, external: true }]
      : []),
    ...(settings.refund_policy_url
      ? [{ label: "Refunds", href: settings.refund_policy_url, external: true }]
      : []),
    ...(settings.support_url
      ? [{ label: "Support", href: settings.support_url, external: true }]
      : settings.support_email
        ? [
            {
              label: "Support",
              href: `mailto:${settings.support_email}`,
              external: true,
            },
          ]
        : []),
    ...landing.footer.links.map((l) => ({
      label: l.label,
      href: l.url,
      external: true,
    })),
  ];
  return (
    <footer className="border-t border-divider px-5 py-6 text-[13px] leading-6 text-muted sm:px-10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="m-0">
          © <Year /> Bitzpark Limited. All rights reserved.
        </p>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <nav aria-label="Footer">
            <Link
              href="/pricing"
              className="text-muted underline-offset-4 hover:underline"
            >
              Plans in Naira
            </Link>
            {links.map((l) => (
              <a
                key={l.label + l.href}
                href={l.href}
                className="ml-6 text-muted underline-offset-4 hover:underline"
                rel="noopener"
              >
                {l.label}
              </a>
            ))}
          </nav>
          <p className="m-0">
            Built by{" "}
            <a
              href={BITZPARK_URL}
              className="text-muted underline underline-offset-4"
              rel="noopener"
            >
              Bitzpark Limited
            </a>
            .
          </p>
        </div>
      </div>
    </footer>
  );
}
