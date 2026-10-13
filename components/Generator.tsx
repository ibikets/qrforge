"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PLANS, type PlanId } from "@/lib/plans";
import { QR_TYPES, FIELD_DEFS, buildPayload, type Fields, type QrType } from "@/lib/qr";
import { renderSvg, sanitizeStyle, svgDataUrl } from "@/lib/qr-render";

type Format = "png" | "svg" | "pdf";
type Dots = "square" | "rounded" | "dots";

export type SavedCode = {
  id: string;
  name: string;
  type: QrType;
  fields: Fields;
  style: { fg?: string; bg?: string; dots?: string; size?: number; logo?: string | null };
};

export default function Generator({
  plan,
  signedIn = false,
  initial,
}: {
  plan: PlanId;
  signedIn?: boolean;
  initial?: SavedCode;
}) {
  // `caps` only drives the UI hints. Every limit is enforced again on the server.
  const caps = PLANS[plan];
  const [type, setType] = useState<QrType>(initial?.type ?? "url");
  const [fields, setFields] = useState<Fields>(initial?.fields ?? { url: "https://" });
  const [fg, setFg] = useState(initial?.style.fg ?? "#111111");
  const [bg, setBg] = useState(initial?.style.bg ?? "#ffffff");
  const [dots, setDots] = useState<Dots>((initial?.style.dots as Dots) ?? "square");
  const [size, setSize] = useState(initial?.style.size ?? 512);
  const [logo, setLogo] = useState<string | null>(initial?.style.logo ?? null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<Format | null>(null);
  const [name, setName] = useState(initial?.name ?? "");
  const [savedId, setSavedId] = useState<string | undefined>(initial?.id);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const payload = useMemo(() => buildPayload(type, fields), [type, fields]);
  const style = useMemo(() => sanitizeStyle({ fg, bg, dots, logo }), [fg, bg, dots, logo]);
  const effSize = Math.min(size, caps.maxSize);

  const preview = useMemo(() => {
    if (!payload) return null;
    try {
      return svgDataUrl(renderSvg(payload, style, 280));
    } catch {
      return null;
    }
  }, [payload, style]);

  function pickType(t: QrType) {
    const def = QR_TYPES.find((x) => x.id === t)!;
    if (!def.basic && caps.types === "basic") {
      setNotice(`${def.label} QR codes are on Pro and Business.`);
      return;
    }
    setNotice("");
    setType(t);
    setFields(t === "url" ? { url: "https://" } : {});
  }

  async function download(fmt: Format) {
    setNotice("");
    if (!payload) return setNotice("Fill in the details first.");
    setBusy(fmt);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, fields, style: { fg, bg, dots, logo }, format: fmt, size: effSize }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        return setNotice(j.error ?? "Could not generate the file.");
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(name || "qrcode").replace(/[^\w-]+/g, "_")}.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(null);
    }
  }

  function onLogo(file?: File) {
    if (!file) return;
    if (!caps.logo) return setNotice("Adding a logo is on Pro and Business.");
    const r = new FileReader();
    r.onload = () => {
      // shrink to max 256px so saved codes and uploads stay small
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 256 / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        setLogo(c.toDataURL("image/png"));
      };
      img.src = r.result as string;
    };
    r.readAsDataURL(file);
  }

  async function save() {
    setSaveMsg("");
    if (!signedIn) return setSaveMsg("Sign in to save codes to your account.");
    if (!name.trim()) return setSaveMsg("Give your code a name first.");
    if (!payload) return setSaveMsg("Fill in the details first.");
    setSaving(true);
    const res = await fetch("/api/codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: savedId, name, type, fields, style: { fg, bg, dots, size: effSize, logo } }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setSaveMsg(json.error ?? "Could not save");
    setSavedId(json.id);
    setSaveMsg(savedId ? "Updated." : "Saved to your account.");
  }

  const set = (k: string, v: string) => setFields((f) => ({ ...f, [k]: v }));
  const input =
    "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900";

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          {QR_TYPES.map((t) => {
            const isLocked = !t.basic && caps.types === "basic";
            return (
              <button
                key={t.id}
                onClick={() => pickType(t.id)}
                className={`rounded-full border px-4 py-1.5 text-sm transition ${
                  type === t.id
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-900"
                }`}
              >
                {t.label}
                {isLocked && <span className="ml-1.5 text-xs opacity-60">Pro</span>}
              </button>
            );
          })}
        </div>

        <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5">
          {FIELD_DEFS[type].map((d) => (
            <label key={d.key} className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-600">{d.label}</span>
              {d.kind === "textarea" ? (
                <textarea className={input} rows={3} value={fields[d.key] ?? ""} onChange={(e) => set(d.key, e.target.value)} />
              ) : d.kind === "select" ? (
                <select className={input} value={fields[d.key] ?? d.options![0]} onChange={(e) => set(d.key, e.target.value)}>
                  {d.options!.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              ) : d.kind === "checkbox" ? (
                <input type="checkbox" checked={fields[d.key] === "true"} onChange={(e) => set(d.key, String(e.target.checked))} />
              ) : (
                <input className={input} placeholder={d.placeholder} value={fields[d.key] ?? ""} onChange={(e) => set(d.key, e.target.value)} />
              )}
            </label>
          ))}
        </div>

        <div className="grid gap-4 rounded-2xl border border-neutral-200 bg-white p-5 sm:grid-cols-2">
          <label className="text-xs font-medium text-neutral-600">
            QR colour
            <input type="color" value={fg} onChange={(e) => setFg(e.target.value)} className="mt-1 block h-9 w-full" />
          </label>
          <label className="text-xs font-medium text-neutral-600">
            Background
            <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="mt-1 block h-9 w-full" />
          </label>
          <label className="text-xs font-medium text-neutral-600">
            Dot style
            <select className={`${input} mt-1`} value={dots} onChange={(e) => setDots(e.target.value as Dots)}>
              <option value="square">Square</option>
              <option value="rounded">Rounded</option>
              <option value="dots">Dots</option>
            </select>
          </label>
          <label className="text-xs font-medium text-neutral-600">
            Size: {effSize}px
            <input
              type="range"
              min={256}
              max={caps.maxSize}
              step={64}
              value={effSize}
              onChange={(e) => setSize(Number(e.target.value))}
              className="mt-2 block w-full"
            />
          </label>
          <label className="text-xs font-medium text-neutral-600 sm:col-span-2">
            Logo in centre {!caps.logo && <span className="opacity-60">(Pro)</span>}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => onLogo(e.target.files?.[0])} className="mt-1 block w-full text-sm" />
          </label>
        </div>
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 text-center">
          <div className="mx-auto flex h-[280px] w-[280px] items-center justify-center overflow-hidden rounded-lg bg-neutral-50">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="QR code preview" width={280} height={280} />
            ) : (
              <span className="px-6 text-sm text-neutral-400">Fill in the details to see your code</span>
            )}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {(["png", "svg", "pdf"] as Format[]).map((f) => (
              <button
                key={f}
                onClick={() => download(f)}
                disabled={busy !== null}
                className={`rounded-lg px-3 py-2 text-sm font-medium uppercase disabled:opacity-60 ${
                  caps.formats.includes(f) ? "bg-neutral-900 text-white hover:bg-neutral-700" : "bg-neutral-100 text-neutral-400"
                }`}
              >
                {busy === f ? "…" : f}
              </button>
            ))}
          </div>

          <div className="mt-4 border-t border-neutral-200 pt-4 text-left">
            <input className={input} placeholder="Name this code (e.g. Shop WiFi)" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            <button
              onClick={save}
              disabled={saving}
              className="mt-2 w-full rounded-lg border border-neutral-900 px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-900 hover:text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : savedId ? "Update saved code" : "Save to my account"}
            </button>
            {saveMsg && <p className="mt-2 text-sm text-neutral-600">{saveMsg}</p>}
            {signedIn && (
              <Link href="/codes" className="mt-1 inline-block text-sm text-neutral-600 underline">
                My saved codes
              </Link>
            )}
          </div>

          {notice && (
            <p className="mt-3 text-sm text-amber-700">
              {notice}{" "}
              <Link href="/pricing" className="font-medium underline">
                See plans
              </Link>
            </p>
          )}
          <p className="mt-3 text-xs text-neutral-500">Plan: {caps.name}.</p>
        </div>
      </aside>
    </div>
  );
}
