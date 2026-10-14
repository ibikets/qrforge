"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** The public footer is not shown inside the management area or on recipients' hosted pages. */
export default function PublicFooter({ children }: { children: ReactNode }) {
  return /^\/(admin|p)(\/|$)/.test(usePathname() || "") ? null : <>{children}</>;
}
