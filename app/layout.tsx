import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Suspense } from "react";
import AuthNav from "@/components/AuthNav";

export const metadata: Metadata = {
  title: "QRForge: QR code generator",
  description: "Create QR codes for links, WiFi, WhatsApp, contacts and more. Download as PNG, SVG or PDF.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-neutral-50 text-neutral-900">
        <header className="border-b border-neutral-200 bg-white">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              QRForge
            </Link>
            <div className="flex items-center gap-5 text-sm">
              <Link href="/pricing" className="text-neutral-600 hover:text-neutral-900">
                Pricing
              </Link>
              <Suspense fallback={<span className="w-16" />}>
                <AuthNav />
              </Suspense>
            </div>
          </nav>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="py-8 text-center text-xs text-neutral-500">QRForge</footer>
      </body>
    </html>
  );
}
