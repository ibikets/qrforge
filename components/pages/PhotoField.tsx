"use client";
import { useRef, useState } from "react";
import Cropper, { readImageFile, type Crop, type Nat } from "@/components/pages/Cropper";
import { Button } from "@/components/ui/Button";
import { initials } from "@/lib/pages/card";

/** Personal photo for a hosted card: choose -> reposition/zoom -> confirm -> server crops, optimises and stores it privately. */
export default function PhotoField({
  pageId, name, mediaId, disabled, onChange, setError,
}: { pageId: string; name: string; mediaId: string | null; disabled: boolean; onChange: (id: string | null) => void; setError: (m: string) => void }) {
  const [pick, setPick] = useState<{ file: File; url: string; nat: Nat } | null>(null);
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function choose(f: File | undefined) {
    if (!f) return;
    setError("");
    const r = await readImageFile(f);
    if ("error" in r) return setError(r.error);
    setPick({ file: f, url: r.url, nat: r.nat });
  }
  function done() { setPick(null); if (input.current) input.current.value = ""; }
  async function upload(crop: Crop) {
    if (!pick) return;
    setBusy(true); setError("");
    const fd = new FormData();
    fd.set("file", pick.file); fd.set("kind", "portrait"); fd.set("crop", JSON.stringify(crop));
    try {
      const r = await fetch(`/api/pages/${pageId}/media`, { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setError(j.error ?? "The photo could not be uploaded.");
      else { onChange(j.id); setLocal(""); done(); }
    } catch { setError("The photo could not be uploaded. Check your connection and try again."); }
    setBusy(false);
  }

  return (
    <fieldset className="mb-6 min-w-0 border-0 p-0" disabled={disabled}>
      <legend className="mb-2 text-sm font-medium">Photo (optional)</legend>
      {!pick ? (
        <div className="flex flex-wrap items-center gap-4">
          {mediaId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/pages/${pageId}/media/${mediaId}`} alt={`Photo of ${name || "you"}`} width={96} height={96} className="size-24 rounded-full border border-divider object-cover" />
          ) : (
            <div role="img" aria-label="No photo yet. Initials are shown instead." className="flex size-24 items-center justify-center rounded-full bg-soft text-3xl font-semibold text-brand">{initials(name)}</div>
          )}
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-control border border-brand px-5 py-3 font-medium text-brand hover:bg-soft has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand">
              {mediaId ? "Replace photo" : "Add photo"}
              <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => choose(e.target.files?.[0])} />
            </label>
            {mediaId ? <Button variant="ghost" onClick={() => { onChange(null); setLocal("Photo removed. Save to keep this change."); }}>Remove photo</Button> : null}
          </div>
          <p className="basis-full text-[13px] text-muted">PNG, JPEG or WebP up to 5 MB. We crop it square, shrink it and remove hidden location data. Without a photo your initials are shown.</p>
          <p role="status" className="basis-full text-[13px] text-muted">{local}</p>
        </div>
      ) : (
        <Cropper src={pick.url} nat={pick.nat} busy={busy} confirmLabel="Use this photo" onConfirm={upload} onCancel={done} />
      )}
    </fieldset>
  );
}
