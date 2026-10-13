"use client";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";

export type Format = "png" | "svg" | "pdf";
export type DlState = { state: "idle" | "pending" | "done" | "error"; msg: string };

export default function ExportPanel({
  preview,
  typeLabel,
  attempted,
  firstError,
  format,
  onFormat,
  allowedFormats,
  size,
  maxSize,
  onSize,
  dl,
  onDownload,
  onBackToContent,
  onUpgradeFormat,
  planName,
}: {
  preview: string | null;
  typeLabel: string;
  attempted: boolean;
  firstError: string | null;
  format: Format;
  onFormat: (f: Format) => void;
  allowedFormats: Format[];
  size: number;
  maxSize: number;
  onSize: (n: number) => void;
  dl: DlState;
  onDownload: () => void;
  onBackToContent: () => void;
  onUpgradeFormat: () => void;
  planName: string;
}) {
  const locked = !allowedFormats.includes(format);
  const busy = dl.state === "pending";
  const F = format.toUpperCase();
  return (
    <aside
      id="export"
      tabIndex={-1}
      aria-labelledby="export-h"
      className="self-start rounded-panel bg-soft p-6 outline-none min-[1100px]:sticky min-[1100px]:top-6"
    >
      <h2 id="export-h" className="text-lg font-medium">
        Export preview
      </h2>
      <div className="mb-6 mt-5 bg-white p-3">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={`${typeLabel} QR code preview`} width={280} height={280} className="block aspect-square w-full" />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center px-6 text-center text-sm text-muted">
            Your code appears here once the details are valid.
          </div>
        )}
      </div>

      <fieldset className="mb-5 border-0 p-0">
        <legend className="mb-2 text-sm font-medium">Format</legend>
        <div className="grid grid-cols-3 gap-2">
          {(["png", "svg", "pdf"] as Format[]).map((f) => {
            const ok = allowedFormats.includes(f);
            return (
              <label
                key={f}
                className={`flex min-h-12 cursor-pointer flex-col items-center justify-center rounded-control border bg-transparent p-2 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-brand ${
                  format === f ? "border-brand text-brand" : "border-divider text-muted"
                }`}
              >
                <input type="radio" name="format" value={f} checked={format === f} onChange={() => onFormat(f)} className="sr-only" />
                <span className="font-medium">{f.toUpperCase()}</span>
                {!ok ? <span className="text-xs">Pro</span> : null}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mb-5">
        <label htmlFor="size" className="mb-2 flex justify-between text-sm font-medium">
          <span>Size</span>
          <output htmlFor="size">{size} px</output>
        </label>
        <input
          id="size"
          type="range"
          min={256}
          max={maxSize}
          step={64}
          value={size}
          onChange={(e) => onSize(Number(e.target.value))}
          className="min-h-12 w-full"
          aria-describedby="size-help"
        />
        <p id="size-help" className="text-[13px] text-muted">
          {planName} plan: up to {maxSize} px.
        </p>
      </div>

      {attempted && firstError ? (
        <Notice tone="error" live title="Check your details">
          {firstError}
          <div className="mt-3">
            <Button variant="secondary" onClick={onBackToContent}>
              Back to content
            </Button>
          </div>
        </Notice>
      ) : null}

      {locked ? (
        <Button className="w-full" onClick={onUpgradeFormat}>
          Download {F} with Pro
        </Button>
      ) : (
        <Button className="w-full" onClick={onDownload} aria-disabled={busy || undefined} disabled={busy}>
          {busy ? "Preparing file…" : `Download ${F}`}
        </Button>
      )}
      {!locked ? <p className="mt-3 text-center text-[13px] text-muted">{format === "png" && planName === "Free" ? "Free PNG · No payment needed" : `${F} download`}</p> : null}

      <div role="status" aria-live="polite" className="mt-3 text-sm">
        {dl.state === "pending" ? <p>Preparing your {F}…</p> : null}
        {dl.state === "done" ? <p>{dl.msg}</p> : null}
      </div>
      {dl.state === "error" ? (
        <div role="alert" className="mt-3 text-sm">
          <p className="font-medium text-danger">We couldn’t prepare your file</p>
          <p className="text-muted">{dl.msg}</p>
          <div className="mt-3">
            <Button variant="secondary" onClick={onDownload}>
              Try again
            </Button>
          </div>
        </div>
      ) : null}

      <hr className="my-6 border-0 border-t border-divider" />
      <p className="text-[13px] text-muted">Scan the downloaded code with your phone before printing.</p>
    </aside>
  );
}
