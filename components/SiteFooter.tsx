import { cacheLife } from "next/cache";
import Link from "next/link";

/** Verified in the project context: bitzpark.com is the Bitzpark Limited site (canonical, © line matches). */
const BITZPARK_URL = "https://bitzpark.com";

/** Cached so the year is part of the static shell; it refreshes within a day, so it rolls over on 1 January. */
async function Year() {
  "use cache";
  cacheLife("days");
  return <>{new Date().getFullYear()}</>;
}

export default function SiteFooter() {
  return (
    <footer className="border-t border-divider px-5 py-6 text-[13px] leading-6 text-muted sm:px-10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="m-0">
          © <Year /> Bitzpark Limited. All rights reserved.
        </p>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <nav aria-label="Footer">
            <Link href="/pricing" className="text-muted underline-offset-4 hover:underline">
              Plans in Naira
            </Link>
          </nav>
          <p className="m-0">
            Built by{" "}
            <a href={BITZPARK_URL} className="text-muted underline underline-offset-4" rel="noopener">
              Bitzpark Limited
            </a>
            .
          </p>
        </div>
      </div>
    </footer>
  );
}
