"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** The public footer is not shown inside the management area. */
export default function PublicFooter({ children }: { children: ReactNode }) {
  return (usePathname() || "").startsWith("/admin") ? null : <>{children}</>;
}
