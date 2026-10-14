import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Suspense } from "react";
import "./globals.css";
import AuthNav from "@/components/AuthNav";
import NavFallback from "@/components/NavFallback";
import SiteFooter from "@/components/SiteFooter";
import PublicFooter from "@/components/PublicFooter";

const plex = localFont({
  src: "./fonts/IBMPlexSans-variable.woff2",
  weight: "100 700",
  variable: "--font-plex",
  display: "swap",
});

const SITE = process.env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  ...(SITE ? { metadataBase: new URL(SITE) } : {}),
  applicationName: "Qrenuvi",
  title: { default: "Qrenuvi: Create a code. Make a connection.", template: "%s · Qrenuvi" },
  description:
    "Create QR codes for links, text, email, WiFi, contacts and more. Download PNG free; SVG, PDF and logo styling on paid plans, billed in Naira.",
  manifest: "/icons/site.webmanifest",
  icons: {
    icon: [
      { url: "/icons/favicon.ico", sizes: "any" },
      { url: "/icons/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-light-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: { siteName: "Qrenuvi", type: "website", title: "Qrenuvi", description: "Create a code. Make a connection." },
  twitter: { card: "summary_large_image", title: "Qrenuvi", description: "Create a code. Make a connection." },
};

export const viewport: Viewport = { themeColor: "#176B4F" };

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
        <Suspense fallback={<NavFallback />}>
          <AuthNav />
        </Suspense>
        <div className="shell-main flex min-h-dvh flex-col">
          <main id="main" tabIndex={-1} className="flex-1 outline-none">
            {children}
          </main>
          <Suspense fallback={null}>
            <PublicFooter>
              <SiteFooter />
            </PublicFooter>
          </Suspense>
        </div>
      </body>
    </html>
  );
}
