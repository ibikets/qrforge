"use client";
import { useEffect, useState } from "react";
import { LinkButton } from "@/components/ui/Button";
import { readReturnIntent } from "@/lib/qr-draft";

/** Shows a link back to the editor only if this tab kept a draft before checkout. */
export default function ReturnToDraft() {
  const [path, setPath] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setPath(readReturnIntent()), 0);
    return () => clearTimeout(t);
  }, []);
  return path ? <LinkButton href={path}>Return to your draft</LinkButton> : null;
}
