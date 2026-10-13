"use client";
import { useId, useRef, useState } from "react";
import { controlClass } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { MAX_LOGO_CHARS } from "@/lib/qr-render";
import { contrastWarning } from "@/lib/qr-validation";
import { Notice } from "@/components/ui/Notice";

export type Dots = "square" | "rounded" | "dots";
const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_INPUT_BYTES = 5 * 1024 * 1024; // input ceiling before downscaling; the server limit applies to the prepared data URL

function ColourField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setText(value);
  }
  const invalid = !HEX.test(text);
  return (
    <div className="mb-6">
      <label htmlFor={`${id}-hex`} className="mb-2 block text-sm font-medium">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          type="color"
          aria-label={`${label} swatch`}
          value={HEX.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 w-14 shrink-0 rounded-control border border-control-border bg-surface p-1"
        />
        <input
          id={`${id}-hex`}
          className={controlClass}
          value={text}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-err` : undefined}
          onChange={(e) => {
            let v = e.target.value.trim();
            if (v && !v.startsWith("#")) v = `#${v}`;
            setText(v);
            if (HEX.test(v)) onChange(v.toLowerCase());
          }}
          onBlur={() => HEX.test(text) || setText(value)}
        />
      </div>
      {invalid ? (
        <p id={`${id}-err`} className="mt-2 text-[13px] text-danger">
          Use a six-digit hex colour, for example #111111.
        </p>
      ) : null}
    </div>
  );
}

async function prepareLogo(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Choose a PNG, JPEG or WebP image.");
  if (file.size > MAX_INPUT_BYTES) throw new Error("That image is over 5 MB. Choose a smaller one.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("We couldn’t read that image."));
      i.src = url;
    });
    // downscale to at most 256px (as before); step down until the data URL fits the server limit
    for (const [max, mime, q] of [
      [256, "image/png", undefined],
      [256, "image/webp", 0.9],
      [192, "image/webp", 0.8],
      [128, "image/webp", 0.8],
    ] as const) {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * k));
      c.height = Math.max(1, Math.round(img.height * k));
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      const out = c.toDataURL(mime, q);
      if (out.startsWith(`data:${mime}`) && out.length <= MAX_LOGO_CHARS) return out;
    }
    throw new Error("The prepared image is still too large for the server limit.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function AppearancePanel({
  fg,
  bg,
  dots,
  logo,
  logoName,
  logoAllowed,
  onFg,
  onBg,
  onDots,
  onLogo,
  onUpgradeLogo,
  onResetColours,
  onResetAppearance,
}: {
  fg: string;
  bg: string;
  dots: Dots;
  logo: string | null;
  logoName: string | null;
  logoAllowed: boolean;
  onFg: (v: string) => void;
  onBg: (v: string) => void;
  onDots: (v: Dots) => void;
  onLogo: (dataUrl: string | null, name: string | null) => void;
  onUpgradeLogo: () => void;
  onResetColours: () => void;
  onResetAppearance: () => void;
}) {
  const uid = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  return (
    <div>
      <h2 className="mb-5 text-2xl font-medium leading-snug">Colours</h2>
      <div className="grid gap-x-6 sm:grid-cols-2">
        <ColourField id={`${uid}-fg`} label="QR colour" value={fg} onChange={onFg} />
        <ColourField id={`${uid}-bg`} label="Background" value={bg} onChange={onBg} />
      </div>
      <p className="-mt-3 mb-4 text-[13px] text-muted">Dark modules on a light background are the safest default.</p>
      {contrastWarning(fg, bg) ? (
        <Notice tone="warning" title="These colours may be hard to scan">
          Use dark modules on a light background. Test the exported code before printing.
          <div className="mt-3">
            <Button variant="secondary" onClick={onResetColours}>
              Reset colours
            </Button>
          </div>
        </Notice>
      ) : (
        <div className="mb-6">
          <Button variant="ghost" onClick={onResetColours}>
            Reset colours
          </Button>
        </div>
      )}

      <fieldset className="mb-8 border-0 p-0">
        <legend className="mb-2 text-sm font-medium">Dot style</legend>
        <div className="flex flex-wrap gap-x-6">
          {(["square", "rounded", "dots"] as Dots[]).map((d) => (
            <label key={d} className="flex min-h-12 items-center gap-3">
              <input type="radio" name="dots" className="size-6" checked={dots === d} onChange={() => onDots(d)} />
              {d[0].toUpperCase() + d.slice(1)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="rounded-control border border-dashed border-control-border p-6">
        <h3 className="mb-2 text-lg font-medium">
          Centre logo{" "}
          {!logoAllowed ? <span className="ml-1 rounded bg-soft px-2 py-1 text-xs font-medium text-brand">Pro</span> : null}
        </h3>
        {!logoAllowed ? (
          <>
            <p className="mb-4 text-muted">Add your business logo with Pro.</p>
            <Button variant="secondary" onClick={onUpgradeLogo}>
              Add a logo with Pro
            </Button>
          </>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted">PNG, JPEG or WebP. It is resized to 256px. Test-scan the result before printing.</p>
            <label htmlFor={`${uid}-logo`} className="mb-2 block text-sm font-medium">
              Logo image
            </label>
            <input
              ref={fileRef}
              id={`${uid}-logo`}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-describedby={logoError ? `${uid}-logo-err` : undefined}
              className="block w-full text-sm file:mr-3 file:min-h-12 file:cursor-pointer file:rounded-control file:border file:border-brand file:bg-transparent file:px-4 file:font-medium file:text-brand"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setLogoError(null);
                setPreparing(true);
                try {
                  onLogo(await prepareLogo(f), f.name);
                } catch (er) {
                  setLogoError(er instanceof Error ? er.message : "We couldn’t use that image.");
                } finally {
                  setPreparing(false);
                  if (fileRef.current) fileRef.current.value = "";
                }
              }}
            />
            {preparing ? <p role="status" className="mt-2 text-sm text-muted">Preparing image…</p> : null}
            {logoError ? (
              <p id={`${uid}-logo-err`} role="alert" className="mt-2 text-[13px] text-danger">
                We couldn’t use that image. {logoError}
              </p>
            ) : null}
            {logo ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo} alt="" width={48} height={48} className="size-12 rounded border border-divider object-contain" />
                <span className="min-w-0 flex-1 break-words text-sm">{logoName ?? "Logo"}</span>
                <Button variant="secondary" onClick={() => onLogo(null, null)}>
                  Remove logo
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="mt-8 border-t border-divider pt-5">
        <Button variant="ghost" onClick={onResetAppearance}>
          Reset appearance
        </Button>
        <span className="ml-2 text-[13px] text-muted">Keeps your content and name.</span>
      </div>
    </div>
  );
}
