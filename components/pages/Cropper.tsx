"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

const BOX = 240;
export type Crop = { cx: number; cy: number; zoom: number };
export type Nat = { w: number; h: number };

/** Read a chosen file as an image, or explain why not. Only PNG, JPEG and WebP up to 5 MB. */
export function readImageFile(f: File): Promise<{ url: string; nat: Nat } | { error: string }> {
  return new Promise((resolve) => {
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return resolve({ error: "Use a PNG, JPEG or WebP image." });
    if (f.size > 5 * 1024 * 1024) return resolve({ error: "That file is too large. The limit is 5 MB." });
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => resolve({ url, nat: { w: img.naturalWidth, h: img.naturalHeight } });
    img.onerror = () => { URL.revokeObjectURL(url); resolve({ error: "That file could not be read as an image." }); };
    img.src = url;
  });
}

/**
 * Square crop chooser: drag, arrow keys (+/- to zoom), Left/Right/Up/Down buttons, zoom slider. It only chooses the square;
 * the caller (server for hosted cards, canvas for the static contact file) does the actual cropping.
 */
export default function Cropper({ src, nat, busy, confirmLabel, onConfirm, onCancel }: { src: string; nat: Nat; busy: boolean; confirmLabel: string; onConfirm: (c: Crop) => void; onCancel: () => void }) {
  const [crop, setCrop] = useState<Crop>({ cx: 0.5, cy: 0.5, zoom: 1 });
  const [drag, setDrag] = useState<{ x: number; y: number; c: Crop } | null>(null);
  useEffect(() => () => URL.revokeObjectURL(src), [src]);
  const clamp = (c: Crop): Crop => {
    const side = Math.min(nat.w, nat.h) / c.zoom;
    const lo = (n: number) => side / 2 / n, hi = (n: number) => 1 - side / 2 / n;
    return { zoom: c.zoom, cx: Math.min(Math.max(c.cx, lo(nat.w)), hi(nat.w)), cy: Math.min(Math.max(c.cy, lo(nat.h)), hi(nat.h)) };
  };
  const move = (dx: number, dy: number) => setCrop((c) => clamp({ ...c, cx: c.cx + dx, cy: c.cy + dy }));
  const side = Math.min(nat.w, nat.h) / crop.zoom, scale = BOX / side;
  const view = { w: nat.w * scale, h: nat.h * scale, x: -(crop.cx * nat.w - side / 2) * scale, y: -(crop.cy * nat.h - side / 2) * scale };
  return (
    <div>
      <div
        tabIndex={0}
        role="group"
        aria-label="Photo position. Drag, or use the arrow keys to move and plus or minus to zoom."
        style={{ width: BOX, height: BOX, touchAction: "none" }}
        className="relative mb-3 cursor-grab overflow-hidden rounded-full border border-control-border bg-disabled active:cursor-grabbing"
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); setDrag({ x: e.clientX, y: e.clientY, c: crop }); }}
        onPointerMove={(e) => {
          if (!drag) return;
          const s = BOX / (Math.min(nat.w, nat.h) / drag.c.zoom);
          setCrop(clamp({ ...drag.c, cx: drag.c.cx - (e.clientX - drag.x) / s / nat.w, cy: drag.c.cy - (e.clientY - drag.y) / s / nat.h }));
        }}
        onPointerUp={() => setDrag(null)}
        onKeyDown={(e) => {
          const s = 0.03 / crop.zoom;
          if (e.key === "ArrowLeft") { e.preventDefault(); move(-s, 0); }
          else if (e.key === "ArrowRight") { e.preventDefault(); move(s, 0); }
          else if (e.key === "ArrowUp") { e.preventDefault(); move(0, -s); }
          else if (e.key === "ArrowDown") { e.preventDefault(); move(0, s); }
          else if (e.key === "+" || e.key === "=") { e.preventDefault(); setCrop((c) => clamp({ ...c, zoom: Math.min(4, c.zoom + 0.1) })); }
          else if (e.key === "-") { e.preventDefault(); setCrop((c) => clamp({ ...c, zoom: Math.max(1, c.zoom - 0.1) })); }
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" draggable={false} style={{ position: "absolute", width: view.w, height: view.h, left: view.x, top: view.y, maxWidth: "none" }} />
      </div>
      <label htmlFor="photo-zoom" className="mb-1 block text-sm font-medium">Zoom</label>
      <input id="photo-zoom" type="range" min={1} max={4} step={0.05} value={crop.zoom} onChange={(e) => setCrop((c) => clamp({ ...c, zoom: Number(e.target.value) }))} className="mb-3 w-full max-w-[240px]" />
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Move photo">
        {([["Left", -1, 0], ["Right", 1, 0], ["Up", 0, -1], ["Down", 0, 1]] as const).map(([l, x, y]) => (
          <Button key={l} variant="secondary" className="!min-h-12 !px-4" onClick={() => move((x * 0.03) / crop.zoom, (y * 0.03) / crop.zoom)}>{l}</Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => onConfirm(crop)} disabled={busy}>{busy ? "Working…" : confirmLabel}</Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
      </div>
    </div>
  );
}
