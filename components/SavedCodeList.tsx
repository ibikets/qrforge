"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QR_TYPES, buildPayload, type Fields, type QrType } from "@/lib/qr";
import { renderSvg, sanitizeStyle, svgDataUrl } from "@/lib/qr-render";
import { Button, LinkButton } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import Dialog from "@/components/ui/Dialog";

export type ListedCode = {
  id: string;
  name: string;
  type: QrType;
  fields: Fields;
  style: { fg?: string; bg?: string; dots?: string; size?: number; logo?: string | null };
  created_at: string;
  updated_at: string;
};

const typeLabel = (t: string) => QR_TYPES.find((x) => x.id === t)?.label ?? t;
const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Thumbnail rendered from the real payload, only once the row is near the viewport. */
function Thumb({ code }: { code: ListedCode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && (setSeen(true), io.disconnect()), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  const src = useMemo(() => {
    if (!seen) return null;
    try {
      const text = buildPayload(code.type, code.fields);
      return text ? svgDataUrl(renderSvg(text, sanitizeStyle(code.style), 64)) : null;
    } catch {
      return null;
    }
  }, [seen, code]);
  return (
    <div ref={ref} className="size-16 shrink-0 bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" width={64} height={64} className="size-16" /> : null}
    </div>
  );
}

export default function SavedCodeList({ codes: initial, planName, max }: { codes: ListedCode[]; planName: string; max: number }) {
  const router = useRouter();
  const [codes, setCodes] = useState(initial);
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [sort, setSort] = useState("updated");
  const [target, setTarget] = useState<ListedCode | null>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");

  // Server data is the source of truth after a refresh.
  const [seenInitial, setSeenInitial] = useState(initial);
  if (seenInitial !== initial) {
    setSeenInitial(initial);
    setCodes(initial);
  }

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = codes.filter((c) => (type === "all" || c.type === type) && (!needle || c.name.toLowerCase().includes(needle)));
    rows.sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "created"
          ? +new Date(b.created_at) - +new Date(a.created_at)
          : +new Date(b.updated_at) - +new Date(a.updated_at)
    );
    return rows;
  }, [codes, q, type, sort]);

  const filtered = q.trim() !== "" || type !== "all";
  const used = codes.length;

  async function remove() {
    if (!target || pending) return;
    setPending(true);
    setErr(null);
    try {
      const res = await fetch(`/api/codes/${target.id}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 404) {
        setErr(j.error ?? "We couldn’t delete this code. Try again.");
        return;
      }
      const gone = target;
      setCodes((c) => c.filter((x) => x.id !== gone.id));
      setAnnounce(`${gone.name} deleted.`);
      setTarget(null);
      router.refresh();
    } catch {
      setErr("Check your connection and try again. The code has not been deleted.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <p className="my-3 text-sm text-muted">
        <meter min={0} max={Math.max(max, 1)} value={Math.min(used, max)} aria-label="Saved codes used" className="mr-3 h-2 w-60 max-w-full align-middle" />
        <span>
          {used} of {max.toLocaleString("en-US")} saved · {planName} plan
        </span>
      </p>
      {used > max ? (
        <Notice tone="warning" title="You have more saved codes than your current plan allows">
          Your codes are all still here. You can open, edit and delete them; saving a new one needs space under your limit.{" "}
          <Link href="/pricing" className="underline">See plans</Link>
        </Notice>
      ) : null}

      {used > 0 ? (
        <div className="my-8 grid gap-4 min-[800px]:grid-cols-[1fr_180px_180px]">
          <div className="[&>div]:mb-0">
            <TextField id="search" label="Search saved codes" type="search" placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
          </div>
          <div className="[&>div]:mb-0">
            <SelectField id="type-filter" label="Type" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="all">All types</option>
              {QR_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="[&>div]:mb-0">
            <SelectField id="sort" label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="updated">Recently updated</option>
              <option value="created">Recently created</option>
              <option value="name">Name</option>
            </SelectField>
          </div>
        </div>
      ) : null}

      <div role="status" aria-live="polite" className="sr-only">
        {announce || (used > 0 ? `${shown.length} of ${used} codes shown` : "")}
      </div>

      {used === 0 ? (
        <div className="rounded-panel bg-surface p-8">
          <h2 className="mb-2 text-2xl font-medium">Your first saved code starts here</h2>
          <p className="mb-6 text-muted">Create a QR code, then save it to find it later.</p>
          <LinkButton href="/create">Create a code</LinkButton>
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-panel bg-surface p-8">
          <h2 className="mb-2 text-2xl font-medium">No codes match this search</h2>
          <p className="mb-6 text-muted">Try another name or clear your filters.</p>
          <Button
            variant="secondary"
            onClick={() => {
              setQ("");
              setType("all");
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <ul className="grid list-none gap-px overflow-hidden rounded-panel border border-divider bg-divider p-0">
          {shown.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-5 bg-surface p-5 [content-visibility:auto] [contain-intrinsic-size:auto_104px]">
              <Thumb code={c} />
              <div className="min-w-0 flex-1 basis-60">
                <h3 className="mb-1 break-words text-lg font-medium">{c.name}</h3>
                <p className="text-[13px] text-muted">
                  {typeLabel(c.type)} · Updated {fmt(c.updated_at)}
                </p>
              </div>
              <div className="flex w-full gap-3 min-[600px]:w-auto">
                <LinkButton variant="secondary" href={`/create?load=${c.id}`} className="flex-1" aria-label={`Open ${c.name}`}>
                  Open
                </LinkButton>
                <Button
                  variant="secondary"
                  className="flex-1"
                  aria-label={`Delete ${c.name}`}
                  onClick={() => {
                    setErr(null);
                    setTarget(c);
                  }}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {used > 0 ? <p className="mt-4 text-[13px] text-muted">Saved codes are static. Editing a code changes new downloads; printed codes keep their original content.</p> : null}

      <Dialog open={target !== null} onClose={() => !pending && setTarget(null)} title={`Delete ${target?.name ?? ""}?`}>
        <p className="mb-6 text-muted">This removes the saved record permanently. Downloaded static codes keep their original content.</p>
        {err ? (
          <p role="alert" className="mb-4 text-sm text-danger">
            {err}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button variant="danger" onClick={remove} disabled={pending}>
            {pending ? "Deleting…" : err ? "Try again" : "Delete code"}
          </Button>
          <Button variant="secondary" data-autofocus onClick={() => setTarget(null)} disabled={pending}>
            Keep code
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
