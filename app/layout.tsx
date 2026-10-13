import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import { Suspense } from "react";
import "./globals.css";
import AuthNav from "@/components/AuthNav";
import NavShell from "@/components/NavShell";

const plex = localFont({
  src: "./fonts/IBMPlexSans-variable.woff2",
  weight: "100 700",
  variable: "--font-plex",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "QRFORGE: QR code generator", template: "%s · QRFORGE" },
  description:
    "Create QR codes for links, text, email, WiFi, contacts and more. Download PNG free; SVG, PDF and logo styling on paid plans, billed in Naira.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plex.variable} h-full antialiased`}>
      <body className="min-h-full">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-control focus:bg-surface focus:px-4 focus:py-3 focus:text-brand"
        >
          Skip to content
        </a>
        <Suspense fallback={<NavShell email={null} />}>
          <AuthNav />
        </Suspense>
        <div className="shell-main flex min-h-dvh flex-col">
          <main id="main" tabIndex={-1} className="flex-1 outline-none">
            {children}
          </main>
          <footer className="flex flex-wrap gap-x-6 gap-y-2 border-t border-divider px-5 py-6 text-[13px] text-muted sm:px-10">
            <span>QRFORGE</span>
            <Link href="/pricing" className="text-muted">Plans in Naira</Link>
          </footer>
        </div>
      </body>
    </html>
  );
}
