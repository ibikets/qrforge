"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

/** Optional company logo. Separate from the photo and never used in its place. No crop: it is fitted whole. */
export default function LogoField({ pageId, mediaId, disabled, onChange, setError }: { pageId: string; mediaId: string | null; disabled: boolean; onChange: (id: string | null) => void; setError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function pick(f: File | undefined) {
    if (!f) return;
    setError("");
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return setError("Use a PNG, JPEG or WebP image.");
    if (f.size > 5 * 1024 * 1024) return setError("That file is too large. The limit is 5 MB.");
    setBusy(true);
    const fd = new FormData(); fd.set("file", f); fd.set("kind", "logo");
    try {
      const r = await fetch(`/api/pages/${pageId}/media`, { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setError(j.error ?? "The logo could not be uploaded."); else onChange(j.id);
    } catch { setError("The logo could not be uploaded. Check your connection and try again."); }
    setBusy(false);
    if (input.current) input.current.value = "";
  }
  return (
    <fieldset className="mb-6 min-w-0 border-0 p-0" disabled={disabled || busy}>
      <legend className="mb-2 text-sm font-medium">Company logo (optional)</legend>
      <div className="flex flex-wrap items-center gap-3">
        {mediaId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/pages/${pageId}/media/${mediaId}`} alt="Your company logo" className="max-h-12 w-auto max-w-40 rounded-control border border-divider bg-white p-1" />
        ) : null}
        <label className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-control border border-brand px-5 py-3 font-medium text-brand hover:bg-soft has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand">
          {busy ? "Uploading…" : mediaId ? "Replace logo" : "Add logo"}
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        {mediaId ? <Button variant="ghost" onClick={() => onChange(null)}>Remove logo</Button> : null}
      </div>
    </fieldset>
  );
}
