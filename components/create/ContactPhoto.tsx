"use client";
import { useRef, useState } from "react";
import Cropper, { readImageFile, type Crop, type Nat } from "@/components/pages/Cropper";
import { Button } from "@/components/ui/Button";
import { MAX_PHOTO_B64, isPhotoB64 } from "@/lib/vcf";
import { initials } from "@/lib/pages/card";

/** Square JPEG of the chosen region, shrunk until it fits the contact-file budget. Canvas re-encoding drops all metadata. */
async function cropToJpeg(url: string, nat: Nat, c: Crop): Promise<string | null> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const side = Math.max(32, Math.floor(Math.min(nat.w, nat.h) / c.zoom));
  const sx = Math.round(Math.min(Math.max(c.cx * nat.w - side / 2, 0), nat.w - side));
  const sy = Math.round(Math.min(Math.max(c.cy * nat.h - side / 2, 0), nat.h - side));
  for (const [px, q] of [[160, 0.72], [144, 0.66], [128, 0.6], [112, 0.55], [96, 0.5]] as const) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = px;
    const g = cv.getContext("2d");
    if (!g) return null;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, px, px);
    g.drawImage(img, sx, sy, side, side, 0, 0, px, px);
    const b64 = cv.toDataURL("image/jpeg", q).split(",")[1] ?? "";
    if (b64.length <= MAX_PHOTO_B64) return b64;
  }
  return null;
}

/**
 * Optional photo for a static contact code. It is NOT written into the QR code (that would make the code too dense to scan);
 * it travels only in the downloadable contact file. Separate from any logo.
 */
export default function ContactPhoto({ name, photo, onChange }: { name: string; photo: string; onChange: (b64: string) => void }) {
  const [pick, setPick] = useState<{ url: string; nat: Nat } | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function choose(f: File | undefined) {
    if (!f) return;
    setMsg("");
    const r = await readImageFile(f);
    if ("error" in r) return setMsg(r.error);
    setPick(r);
  }
  function done() { setPick(null); if (input.current) input.current.value = ""; }
  async function confirm(c: Crop) {
    if (!pick) return;
    setBusy(true);
    const b64 = await cropToJpeg(pick.url, pick.nat, c).catch(() => null);
    setBusy(false);
    if (!b64 || !isPhotoB64(b64)) return setMsg("That photo could not be prepared. Try a different image.");
    onChange(b64);
    setMsg("Photo added to the contact file. The QR code itself stays photo-free.");
    done();
  }
  return (
    <fieldset className="mb-6 min-w-0 border-0 p-0">
      <legend className="mb-2 text-sm font-medium">Photo for the contact file (optional)</legend>
      {pick ? (
        <Cropper src={pick.url} nat={pick.nat} busy={busy} confirmLabel="Use this photo" onConfirm={confirm} onCancel={done} />
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`data:image/jpeg;base64,${photo}`} alt={`Photo of ${name || "you"}`} width={72} height={72} className="size-[72px] rounded-full border border-divider object-cover" />
          ) : (
            <div role="img" aria-label="No photo. Initials are used." className="flex size-[72px] items-center justify-center rounded-full bg-soft text-2xl font-semibold text-brand">{initials(name)}</div>
          )}
          <label className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-control border border-brand px-5 py-3 font-medium text-brand hover:bg-soft has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand">
            {photo ? "Replace photo" : "Add photo"}
            <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => choose(e.target.files?.[0])} />
          </label>
          {photo ? <Button variant="ghost" onClick={() => { onChange(""); setMsg("Photo removed."); }}>Remove photo</Button> : null}
          <p className="basis-full text-[13px] text-muted">
            A small square copy is added to the downloadable contact file (.vcf) only. A photo inside a QR code would make it too dense to scan reliably, so the QR code never contains it. Hosted Digital Business Cards (Pro) show the photo on a page that stays editable.
          </p>
          <p role="status" className="basis-full text-[13px] text-muted">{msg}</p>
        </div>
      )}
    </fieldset>
  );
}
