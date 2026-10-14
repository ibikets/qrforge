"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { controlClass } from "@/components/ui/Field";
import { ActionButton } from "@/components/admin/Mutation";
import { assetUrl } from "@/lib/content";

export type AssetRow = { id: string; path: string; alt: string; width: number; height: number; bytes: number; state: string; created_at: string };

/** Upload and archive images. The server judges the file's content; nothing here is trusted for safety. */
export default function ImageLibrary({ assets, canManage }: { assets: AssetRow[]; canManage: boolean }) {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [alt, setAlt] = useState("");
  const [st, setSt] = useState<{ kind: "idle" } | { kind: "busy" } | { kind: "ok" } | { kind: "error"; message: string; field?: string }>({ kind: "idle" });
  const busy = useRef(false);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (busy.current) return;
    const f = file.current?.files?.[0];
    if (!f) return setSt({ kind: "error", message: "Choose an image file.", field: "file" });
    busy.current = true;
    setSt({ kind: "busy" });
    try {
      const fd = new FormData();
      fd.set("file", f);
      fd.set("alt", alt);
      const res = await fetch("/api/admin/assets", { method: "POST", body: fd, credentials: "same-origin" });
      const j = (await res.json().catch(() => ({}))) as { error?: string; field?: string };
      if (res.ok) {
        setSt({ kind: "ok" });
        setAlt("");
        if (file.current) file.current.value = "";
        router.refresh();
      } else setSt({ kind: "error", message: j.error ?? "The image could not be uploaded. Nothing was saved.", field: j.field });
    } catch {
      setSt({ kind: "error", message: "Could not reach the server. Nothing was saved." });
    }
    busy.current = false;
  }
  const active = assets.filter((a) => a.state === "active");
  const archived = assets.filter((a) => a.state !== "active");
  return (
    <div>
      {canManage ? (
        <form onSubmit={upload} className="mb-6 grid max-w-[560px] gap-4" noValidate>
          <div>
            <label htmlFor="asset-file" className="mb-1 block text-sm font-medium">Image (PNG, JPEG or WebP, up to 2 MB)</label>
            <input id="asset-file" ref={file} type="file" accept="image/png,image/jpeg,image/webp" className={controlClass} aria-invalid={st.kind === "error" && st.field === "file" ? true : undefined} aria-describedby="asset-help" />
            <p id="asset-help" className="mt-1 text-[13px] text-muted">SVG and other formats are refused. The image is re-saved without hidden data.</p>
          </div>
          <div>
            <label htmlFor="asset-alt" className="mb-1 block text-sm font-medium">Description for people who cannot see it (required)</label>
            <input id="asset-alt" className={controlClass} value={alt} maxLength={200} onChange={(e) => setAlt(e.target.value)} aria-invalid={st.kind === "error" && st.field === "alt" ? true : undefined} />
            <p className="mt-1 text-[13px] text-muted">{alt.length}/200 · plain text, 5 characters or more.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={st.kind === "busy"}>{st.kind === "busy" ? "Uploading…" : "Upload image"}</Button>
            <span role="status" aria-live="polite" className="text-sm">
              {st.kind === "ok" ? "Uploaded and saved." : null}
            </span>
          </div>
          {st.kind === "error" ? <p role="alert" className="text-sm text-danger">{st.message}</p> : null}
        </form>
      ) : null}
      {active.length === 0 ? (
        <p className="text-muted">No images yet. Uploaded images appear here and can be chosen on the landing editor.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Images">
          {active.map((a) => (
            <li key={a.id} className="rounded-panel border border-divider p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={assetUrl(a.path)} alt={a.alt} width={a.width} height={a.height} className="mb-2 h-32 w-full rounded-control bg-soft object-contain" />
              <p className="text-sm">{a.alt}</p>
              <p className="mb-2 text-[13px] text-muted">{a.width}×{a.height}px · {Math.round(a.bytes / 1024)} KB</p>
              {canManage ? (
                <ActionButton endpoint="/api/admin/content" payload={{ action: "archive_asset", asset: a.id }} label="Archive" title="Archive this image?" variant="ghost"
                  effect={<>It disappears from the picker. Images are never deleted. This is refused while the draft or the live page still uses it.</>} />
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {archived.length > 0 ? <p className="mt-4 text-[13px] text-muted">{archived.length} archived {archived.length === 1 ? "image is" : "images are"} kept so nothing published can break.</p> : null}
    </div>
  );
}
