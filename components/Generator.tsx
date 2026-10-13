"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PLANS, formatNaira, type PlanId } from "@/lib/plans";
import { QR_TYPES, type Fields, type QrType } from "@/lib/qr";
import { renderSvg, sanitizeStyle, svgDataUrl } from "@/lib/qr-render";
import { safeFileBase, validateContent } from "@/lib/qr-validation";
import { clearDraft, hasContent, isSensitive, loadDraft, saveDraft, setReturnIntent, type Draft } from "@/lib/qr-draft";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import Dialog from "@/components/ui/Dialog";
import ContentPanel from "@/components/create/ContentPanel";
import AppearancePanel, { type Dots } from "@/components/create/AppearancePanel";
import ExportPanel, { type DlState, type Format } from "@/components/create/ExportPanel";

export type SavedCode = {
  id: string;
  name: string;
  type: QrType;
  fields: Fields;
  style: { fg?: string; bg?: string; dots?: string; size?: number; logo?: string | null };
};

type Tab = "content" | "appearance";
type SaveState = "idle" | "saving" | "failed";
type Gate = { title: string; body: string; after?: () => void } | null;
type Leave = { href: string; login: boolean; failed: boolean } | null;

const DEFAULT_FG = "#111111";
const DEFAULT_BG = "#ffffff";
const MIME: Record<Format, string> = { png: "image/png", svg: "image/svg+xml", pdf: "application/pdf" };

export default function Generator({
  plan,
  signedIn = false,
  initial,
  draftId,
  savedCount,
  loadProblem,
}: {
  plan: PlanId;
  signedIn?: boolean;
  initial?: SavedCode;
  draftId?: string;
  savedCount?: number | null;
  loadProblem?: "not-found" | "error" | null;
}) {
  const router = useRouter();
  const caps = PLANS[plan]; // UI hints only; every limit is enforced again on the server

  const [tab, setTab] = useState<Tab>("content");
  const [type, setType] = useState<QrType>(initial?.type ?? "url");
  const [drafts, setDrafts] = useState<Partial<Record<QrType, Fields>>>(initial ? { [initial.type]: initial.fields } : {});
  const [name, setName] = useState(initial?.name ?? "");
  const [fg, setFg] = useState(initial?.style.fg ?? DEFAULT_FG);
  const [bg, setBg] = useState(initial?.style.bg ?? DEFAULT_BG);
  const [dots, setDots] = useState<Dots>((initial?.style.dots as Dots) ?? "square");
  const [size, setSize] = useState(Math.min(initial?.style.size ?? 512, caps.maxSize));
  const [format, setFormat] = useState<Format>("png");
  const [logo, setLogo] = useState<string | null>(initial?.style.logo ?? null);
  const [logoName, setLogoName] = useState<string | null>(initial?.style.logo ? "Saved logo" : null);

  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [attempted, setAttempted] = useState(false);
  const [dl, setDl] = useState<DlState>({ state: "idle", msg: "" });
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMsg, setSaveMsg] = useState<{ kind: "ok" | "error" | "limit"; text: string } | null>(null);
  const [savedId, setSavedId] = useState<string | undefined>(initial?.id);
  const [snap, setSnap] = useState<string | null>(() =>
    initial
      ? JSON.stringify([initial.type, initial.fields, initial.name.trim(), initial.style.fg ?? DEFAULT_FG, initial.style.bg ?? DEFAULT_BG, (initial.style.dots as Dots) ?? "square", Math.min(initial.style.size ?? 512, PLANS[plan].maxSize), initial.style.logo ?? null])
      : null
  );
  const [gate, setGate] = useState<Gate>(null);
  const [leave, setLeave] = useState<Leave>(null);
  const [restore, setRestore] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const fields = useMemo(() => drafts[type] ?? {}, [drafts, type]);
  const def = QR_TYPES.find((t) => t.id === type)!;
  const effSize = Math.min(size, caps.maxSize);
  const v = useMemo(() => validateContent(type, fields), [type, fields]);
  const style = useMemo(() => sanitizeStyle({ fg, bg, dots, logo }), [fg, bg, dots, logo]);

  const preview = useMemo(() => {
    if (!v.ok) return null;
    try {
      return svgDataUrl(renderSvg(v.payload, style, 280));
    } catch {
      return null;
    }
  }, [v, style]);

  const current = useCallback(
    (): Draft => ({ type, fields, name, fg, bg, dots, size: effSize, format, logo, logoName }),
    [type, fields, name, fg, bg, dots, effSize, format, logo, logoName]
  );
  const fingerprint = useMemo(() => JSON.stringify([type, fields, name.trim(), fg, bg, dots, effSize, logo]), [type, fields, name, fg, bg, dots, effSize, logo]);

  // Restore a same-tab draft (opaque id in the URL; content only from sessionStorage).
  useEffect(() => {
    if (!draftId || initial) return;
    // sessionStorage is an external system; read it after mount (deferred so state updates are not synchronous in the effect)
    const t = setTimeout(() => {
      const r = loadDraft(draftId);
      if (!r.ok) {
        setRestore(
          r.reason === "expired"
            ? "Your draft expired after 30 minutes. Enter your details again."
            : "We couldn’t restore your draft. Enter your details again."
        );
        return;
      }
      const d = r.draft;
      setType(d.type);
      setDrafts({ [d.type]: d.fields });
      setName(d.name);
      setFg(d.fg);
      setBg(d.bg);
      setDots(d.dots);
      setSize(Math.min(Math.max(d.size, 256), caps.maxSize));
      setFormat(d.format);
      if (caps.logo) {
        setLogo(d.logo);
        setLogoName(d.logoName);
      }
      setRestore("Your draft is back. Check the details, then continue.");
      clearDraft();
      window.history.replaceState(null, "", "/create");
    }, 0);
    return () => clearTimeout(t);
  }, [draftId, initial, caps.maxSize, caps.logo]);

  // Warn only when a saved code has unsaved edits.
  const dirty = Boolean(savedId) && snap !== null && snap !== fingerprint;
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const status = saveState === "saving" ? "Saving…" : saveState === "failed" ? "Save failed" : !savedId ? "New code" : dirty ? "Unsaved changes" : "Saved";

  const visible = (k: string) => attempted || touched.has(k);
  const setField = (k: string, val: string) => {
    setTouched((t) => new Set(t).add(k));
    setDrafts((d) => ({ ...d, [type]: { ...(d[type] ?? {}), [k]: val } }));
    setDl((s) => (s.state === "done" || s.state === "error" ? { state: "idle", msg: "" } : s));
  };

  function focusField(key: string) {
    setTab("content");
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        (document.getElementById(`f-${key}`) ?? document.getElementById("qr-type"))?.focus();
      })
    );
  }

  function pickType(t: QrType) {
    if (t === type) return;
    const d = QR_TYPES.find((x) => x.id === t)!;
    if (!d.basic && caps.types === "basic") {
      setGate({
        title: `Use ${d.label} codes with Pro`,
        body: `Phone, SMS, WhatsApp, WiFi and Contact codes are on Pro and Business. Your current ${def.label.toLowerCase()} details are unchanged.`,
      });
      return;
    }
    setAttempted(false);
    setTouched(new Set());
    setType(t);
  }

  // ---- leaving for sign-in / pricing with the draft kept per the consent rules
  function go(href: string, login = false) {
    const d = current();
    if (!hasContent(d)) return navigate(href, login, null);
    if (isSensitive(d)) return setLeave({ href, login, failed: false });
    const id = saveDraft(d);
    if (!id) return setLeave({ href, login, failed: true });
    navigate(href, login, id);
  }
  function navigate(href: string, login: boolean, id: string | null) {
    const back = id ? `/create?draft=${id}` : "/create";
    if (id) setReturnIntent(back);
    router.push(login ? `${href}?next=${encodeURIComponent(back)}` : href);
  }

  async function download() {
    if (busyRef.current) return;
    if (!v.ok) {
      setAttempted(true);
      setDl({ state: "idle", msg: "" });
      focusField(v.first);
      return;
    }
    busyRef.current = true;
    setDl({ state: "pending", msg: "" });
    const F = format.toUpperCase();
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, fields, name, style: { fg, bg, dots, logo }, format, size: effSize }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        if (res.status === 403 && j.upgrade) {
          setDl({ state: "idle", msg: "" });
          return setGate({ title: `Download ${F} with Pro`, body: j.error ?? "This needs a paid plan." });
        }
        if (res.status === 400 && j.field) {
          setAttempted(true);
          setDl({ state: "idle", msg: "" });
          return focusField(j.field);
        }
        return setDl({ state: "error", msg: j.error ?? "Check your connection and try again. Your details are still here." });
      }
      const ct = (res.headers.get("content-type") ?? "").split(";")[0];
      if (ct !== MIME[format]) return setDl({ state: "error", msg: "The server sent an unexpected response. Try again. Your details are still here." });
      const blob = await res.blob();
      if (blob.size === 0) return setDl({ state: "error", msg: "The file came back empty. Try again." });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeFileBase(name)}.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setDl({ state: "done", msg: `Your ${F} is ready. Check your browser’s downloads.` });
    } catch {
      setDl({ state: "error", msg: "Check your connection and try again. Your details are still here." });
    } finally {
      busyRef.current = false;
    }
  }

  async function save() {
    if (busyRef.current) return;
    setSaveMsg(null);
    setNameError(null);
    if (!signedIn) return go("/login", true);
    if (!name.trim()) {
      setNameError("Give your code a name before saving.");
      return document.getElementById("code-name")?.focus();
    }
    if (!v.ok) {
      setAttempted(true);
      return focusField(v.first);
    }
    busyRef.current = true;
    setSaveState("saving");
    try {
      const res = await fetch("/api/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: savedId, name, type, fields, style: { fg, bg, dots, size: effSize, logo } }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setSaveState("idle");
        return go("/login", true);
      }
      if (!res.ok || !j.id) {
        setSaveState("failed");
        if (j.code === "limit") return setSaveMsg({ kind: "limit", text: j.error });
        if (j.field === "name") return setNameError(j.error);
        return setSaveMsg({ kind: "error", text: j.error ?? "Your draft is still here. Try again." });
      }
      setSavedId(j.id);
      setSnap(fingerprint);
      setSaveState("idle");
      setSaveMsg({ kind: "ok", text: "Saved to My codes. You can return to this code later. Changes require a new download." });
      clearDraft();
    } catch {
      setSaveState("failed");
      setSaveMsg({ kind: "error", text: "Your draft is still here. Check your connection and try again." });
    } finally {
      busyRef.current = false;
    }
  }

  const atLimit = !savedId && signedIn && typeof savedCount === "number" && savedCount >= caps.maxSaved;
  const pro = PLANS.pro;
  const swatch = `${fg === DEFAULT_FG && bg === DEFAULT_BG ? "Ink on white" : "Custom colours"} · ${dots[0].toUpperCase()}${dots.slice(1)}${logo ? " · Logo" : ""}`;

  return (
    <div className="mx-auto grid max-w-[1280px] gap-8 px-5 py-8 sm:px-10 sm:py-10 min-[1100px]:grid-cols-[minmax(0,1fr)_440px]">
      <div className="min-w-0">
        <div className="mb-7 flex items-center justify-between gap-4 text-sm text-muted">
          <span>
            {signedIn ? (
              <>
                <Link href="/codes" className="text-muted underline">My codes</Link> / {savedId ? name.trim() || "Saved code" : "New code"}
              </>
            ) : (
              "Create / New code"
            )}
          </span>
          <span data-testid="save-status">{status}</span>
        </div>

        <h1 className="mb-3 text-[28px] font-semibold leading-tight tracking-[-0.9px] sm:text-[40px] sm:leading-[1.18]">A code for every handoff.</h1>
        <p className="mb-8 text-lg text-muted">Create it once. Find it when you need it.</p>
        <a href="#export" onClick={() => setTimeout(() => document.getElementById("export")?.focus(), 0)} className="mb-6 inline-flex min-h-12 items-center rounded-control border border-brand px-5 font-medium text-brand no-underline min-[1100px]:hidden">
          Preview &amp; download
        </a>

        {loadProblem === "not-found" ? (
          <Notice tone="warning" live title="We couldn’t find that saved code">
            It may have been deleted. You can start a new code below or go to <Link href="/codes" className="underline">My codes</Link>.
          </Notice>
        ) : null}
        {loadProblem === "error" ? (
          <Notice tone="error" live title="We couldn’t load that saved code">
            Try again. Your saved codes have not been deleted.
            <div className="mt-3">
              <Button variant="secondary" onClick={() => router.refresh()}>
                Try again
              </Button>
            </div>
          </Notice>
        ) : null}
        {restore ? <Notice live title="Draft">{restore}</Notice> : null}

        <TextField
          id="code-name"
          label="Code name (for saving)"
          help="Optional for download. Required when saving."
          value={name}
          maxLength={80}
          autoComplete="off"
          error={nameError}
          onChange={(e) => {
            setName(e.target.value);
            setNameError(null);
          }}
        />

        <Tabs tab={tab} setTab={setTab} />
        <div id="panel-content" role="tabpanel" aria-labelledby="tab-content" hidden={tab !== "content"}>
          <ContentPanel type={type} fields={fields} setField={setField} errors={v.ok ? {} : v.errors} visible={visible} onType={pickType} paidLocked={caps.types === "basic"} />
          <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-5">
            <span className="text-[13px] text-muted">{swatch}</span>
            <Button variant="ghost" onClick={() => setTab("appearance")}>Edit appearance</Button>
          </div>
        </div>
        <div id="panel-appearance" role="tabpanel" aria-labelledby="tab-appearance" hidden={tab !== "appearance"}>
          <AppearancePanel
            fg={fg}
            bg={bg}
            dots={dots}
            logo={logo}
            logoName={logoName}
            logoAllowed={caps.logo}
            onFg={setFg}
            onBg={setBg}
            onDots={setDots}
            onLogo={(d, n) => {
              setLogo(d);
              setLogoName(n);
            }}
            onUpgradeLogo={() => setGate({ title: "Add a logo with Pro", body: `Get SVG, PDF and logo customisation for ${formatNaira(pro.priceNgn)} per 30 days.` })}
            onResetColours={() => {
              setFg(DEFAULT_FG);
              setBg(DEFAULT_BG);
            }}
            onResetAppearance={() => {
              setFg(DEFAULT_FG);
              setBg(DEFAULT_BG);
              setDots("square");
              setLogo(null);
              setLogoName(null);
            }}
          />
        </div>

        <Notice title="Static QR">Changes apply to new downloads. Printed codes keep their original content.</Notice>
        {savedId ? (
          <Notice title="Editing a saved code">Updating changes this saved record and any new download. Codes you already printed or shared are not changed.</Notice>
        ) : null}

        {atLimit ? (
          <Notice tone="warning" live title={`You’ve used all ${caps.maxSaved} ${caps.name} saved slots`}>
            Edit an existing code or choose a plan with more space.
            <div className="mt-3">
              <Button variant="secondary" onClick={() => go("/pricing")}>See plans</Button>
            </div>
          </Notice>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={save} disabled={saveState === "saving"}>
              {saveState === "saving" ? "Saving…" : !signedIn ? "Sign in and save" : savedId ? "Update saved code" : "Save to my codes"}
            </Button>
            {saveMsg?.kind === "ok" ? (
              <Link href="/codes" className="text-brand underline">View My codes</Link>
            ) : null}
          </div>
        )}
        {!atLimit ? (
          <p className="mt-2 text-[13px] text-muted">
            {!signedIn
              ? "Free PNG download works without an account. Saving needs sign-in."
              : savedId
                ? "Updating keeps this saved slot."
                : typeof savedCount === "number"
                  ? `Saving uses one of your ${caps.maxSaved.toLocaleString("en-US")} ${caps.name} saved slots (${savedCount} used).`
                  : `Saving uses one of your ${caps.maxSaved.toLocaleString("en-US")} ${caps.name} saved slots.`}
          </p>
        ) : null}
        <div role="status" aria-live="polite" className="mt-3 text-sm">
          {saveMsg?.kind === "ok" ? <p>{saveMsg.text}</p> : null}
        </div>
        {saveMsg && saveMsg.kind !== "ok" ? (
          <div role="alert" className="mt-3 text-sm">
            <p className="font-medium text-danger">{saveMsg.kind === "limit" ? "You’ve reached your saved-code limit" : "We couldn’t save this code"}</p>
            <p className="text-muted">{saveMsg.text}</p>
            {saveMsg.kind === "limit" ? (
              <Button className="mt-3" variant="secondary" onClick={() => go("/pricing")}>See plans</Button>
            ) : (
              <Button className="mt-3" variant="secondary" onClick={save}>Try again</Button>
            )}
          </div>
        ) : null}
      </div>

      <ExportPanel
        preview={preview}
        typeLabel={def.label}
        attempted={attempted}
        firstError={!v.ok ? v.errors[v.first] : null}
        format={format}
        onFormat={(f) => {
          setFormat(f);
          setDl({ state: "idle", msg: "" });
        }}
        allowedFormats={caps.formats}
        size={effSize}
        maxSize={caps.maxSize}
        onSize={setSize}
        dl={dl}
        onDownload={download}
        onBackToContent={() => v.ok || focusField(v.first)}
        onUpgradeFormat={() =>
          setGate({ title: `Download ${format.toUpperCase()} with Pro`, body: `Get SVG, PDF and logo customisation for ${formatNaira(pro.priceNgn)} per 30 days.`, after: () => setFormat("png") })
        }
        planName={caps.name}
      />

      <Dialog open={gate !== null} onClose={() => setGate(null)} title={gate?.title ?? ""}>
        <p className="mb-6 text-muted">{gate?.body}</p>
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => {
              setGate(null);
              go("/pricing");
            }}
          >
            See Pro plan
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              gate?.after?.();
              setGate(null);
            }}
          >
            Keep using Free
          </Button>
        </div>
      </Dialog>

      <Dialog open={leave !== null} onClose={() => setLeave(null)} title={leave?.failed ? "We couldn’t keep your draft" : "Keep this draft in this tab?"}>
        {leave?.failed ? (
          <p className="mb-6 text-muted">Your browser would not store the draft. Your details are still here: download or copy them before you leave, or continue and enter them again afterwards.</p>
        ) : (
          <p className="mb-6 text-muted">Keep this draft in this tab for 30 minutes so you can return after signing in? It stays in this browser tab only and is cleared after you return or save.</p>
        )}
        <div className="flex flex-wrap gap-3">
          {!leave?.failed ? (
            <Button
              onClick={() => {
                const l = leave!;
                const id = saveDraft(current());
                setLeave(null);
                if (!id) return setLeave({ ...l, failed: true });
                navigate(l.href, l.login, id);
              }}
            >
              Keep draft and continue
            </Button>
          ) : null}
          <Button
            variant="secondary"
            onClick={() => {
              const l = leave!;
              setLeave(null);
              navigate(l.href, l.login, null);
            }}
          >
            {leave?.failed ? "Continue anyway" : "Continue without keeping"}
          </Button>
          <Button variant="ghost" onClick={() => setLeave(null)}>
            Stay here
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function Tabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const order: Tab[] = ["content", "appearance"];
  const labels = { content: "Content", appearance: "Appearance" } as const;
  return (
    <div role="tablist" aria-label="Editor panels" className="mb-8 mt-7 flex gap-6 border-b border-divider">
      {order.map((t) => (
        <button
          key={t}
          id={`tab-${t}`}
          role="tab"
          type="button"
          aria-selected={tab === t}
          aria-controls={`panel-${t}`}
          tabIndex={tab === t ? 0 : -1}
          onClick={() => setTab(t)}
          onKeyDown={(e) => {
            const i = order.indexOf(t);
            const next = e.key === "ArrowRight" ? order[(i + 1) % 2] : e.key === "ArrowLeft" ? order[(i + 1) % 2] : e.key === "Home" ? order[0] : e.key === "End" ? order[1] : null;
            if (next) {
              e.preventDefault();
              setTab(next);
              requestAnimationFrame(() => document.getElementById(`tab-${next}`)?.focus());
            }
          }}
          className={`-mb-px min-h-12 border-b-2 px-3 text-base font-medium ${tab === t ? "border-brand text-brand" : "border-transparent text-muted"}`}
        >
          {labels[t]}
        </button>
      ))}
    </div>
  );
}
