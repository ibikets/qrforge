"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buildPayload } from "@/lib/qr";
import { renderSvg, sanitizeStyle, svgDataUrl } from "@/lib/qr-render";
import type { SavedCode } from "./Generator";

export default function SavedCard({ code }: { code: SavedCode }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const src = useMemo(() => {
    try {
      const text = buildPayload(code.type, code.fields);
      return text ? svgDataUrl(renderSvg(text, sanitizeStyle(code.style), 140)) : null;
    } catch {
      return null;
    }
  }, [code]);

  async function remove() {
    if (!confirm(`Delete "${code.name}"?`)) return;
    setBusy(true);
    await fetch(`/api/codes/${code.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="flex flex-col items-center rounded-2xl border border-neutral-200 bg-white p-4 text-center">
      <div className="flex h-[140px] w-[140px] items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src && <img src={src} alt={code.name} width={140} height={140} />}
      </div>
      <p className="mt-3 w-full truncate font-medium">{code.name}</p>
      <p className="text-xs uppercase tracking-wide text-neutral-500">{code.type}</p>
      <div className="mt-3 flex gap-2">
        <Link href={`/?load=${code.id}`} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm text-white">
          Open
        </Link>
        <button onClick={remove} disabled={busy} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-60">
          Delete
        </button>
      </div>
    </div>
  );
}
