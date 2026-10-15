"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

export type Uploaded = { id: string; name?: string; bytes?: number; pages?: number | null; width?: number; height?: number };
const LIMIT = { file: 10 * 1024 * 1024, image: 5 * 1024 * 1024 } as const;

/**
 * One file picker with progress, retry and clear errors. The browser only checks size and type for a quick message;
 * the server inspects the real content again and decides. The chosen file is kept for "Try again" after a failure.
 */
export default function UploadField({ pageId, kind, label, replaceLabel, disabled, hasFile, onDone, onRemove, removeLabel, describe, id }: {
  pageId: string; kind: "file" | "image"; label: string; replaceLabel?: string; disabled: boolean; hasFile: boolean;
  onDone: (u: Uploaded) => void; onRemove?: () => void; removeLabel?: string; describe?: string; id?: string;
}) {
  const [pct, setPct] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const accept = kind === "file" ? "application/pdf,.pdf" : "image/png,image/jpeg,image/webp";
  const busy = pct !== null;

  function send(f: File) {
    setErr(null); setLast(f);
    if (kind === "file" ? !(f.type === "application/pdf" || /\.pdf$/i.test(f.name)) : !/^image\/(png|jpeg|webp)$/.test(f.type)) return setErr(kind === "file" ? "Choose a PDF file." : "Use a PNG, JPEG or WebP image.");
    if (f.size > LIMIT[kind]) return setErr(`That file is too large. The limit is ${LIMIT[kind] / 1048576} MB.`);
    if (f.size < 1) return setErr("That file is empty.");
    const fd = new FormData(); fd.set("file", f); fd.set("kind", kind);
    const x = new XMLHttpRequest();
    x.open("POST", `/api/pages/${pageId}/media`);
    x.responseType = "json";
    x.upload.onprogress = (e) => { if (e.lengthComputable) setPct(Math.min(99, Math.round((e.loaded / e.total) * 100))); };
    x.onerror = () => { setPct(null); setErr("The upload didn’t finish. Check your connection and try again."); };
    x.ontimeout = x.onerror; x.onabort = x.onerror;
    x.onload = () => {
      setPct(null);
      const j = (x.response ?? {}) as Uploaded & { error?: string };
      if (x.status >= 200 && x.status < 300 && j.id) { setLast(null); onDone(j); }
      else setErr(j.error ?? "That file could not be uploaded.");
    };
    setPct(0); x.timeout = 120_000; x.send(fd);
    if (input.current) input.current.value = "";
  }
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-3">
        <label className={`inline-flex min-h-12 items-center justify-center rounded-control border border-brand px-5 py-3 font-medium text-brand has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${disabled || busy ? "opacity-60" : "cursor-pointer hover:bg-soft"}`}>
          {busy ? "Uploading…" : hasFile ? (replaceLabel ?? "Replace") : label}
          <input id={id} ref={input} type="file" accept={accept} disabled={disabled || busy} className="sr-only" aria-describedby={err ? `${id ?? "up"}-err` : undefined} onChange={(e) => { const f = e.target.files?.[0]; if (f) send(f); }} />
        </label>
        {hasFile && onRemove ? <Button variant="ghost" disabled={disabled || busy} onClick={onRemove}>{removeLabel ?? "Remove"}</Button> : null}
      </div>
      {describe ? <p className="mt-1 text-[13px] text-muted">{describe}</p> : null}
      {busy ? (
        <div className="mt-2" role="status" aria-live="polite">
          <progress className="h-2 w-full max-w-xs" max={100} value={pct ?? 0} aria-label="Upload progress" />
          <span className="ml-2 text-[13px] text-muted">{pct === 99 ? "Checking the file…" : `${pct}%`}</span>
        </div>
      ) : null}
      {err ? (
        <p id={`${id ?? "up"}-err`} role="alert" className="mt-2 text-[13px] text-danger">
          {err}{last && !busy ? <> <button type="button" className="font-medium text-brand underline" onClick={() => send(last)}>Try again</button></> : null}
        </p>
      ) : null}
    </div>
  );
}
