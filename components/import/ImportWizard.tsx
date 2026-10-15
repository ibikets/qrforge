"use client";
import { useMemo, useRef, useState } from "react";
import { Button, LinkButton } from "@/components/ui/Button";
import { controlClass } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { toCsv } from "@/lib/import/export";
import { FIELD_LABEL, UPDATABLE, autoMap, detectHeaderRow, errorReport, fieldsFor, interpretRows, planImport, type Action, type Field, type ImportKind, type Mapping, type Options, type PlanRow } from "@/lib/import/table";
import { MAX_ITEMS } from "@/lib/pages/blocks";
import type { Category } from "@/lib/pages/blocks";
import type { Currency } from "@/lib/pages/items";

type Sheet = { name: string; rows: string[][] };
type Counts = { rows: number; valid: number; invalid: number; skipped: number; added: number; updated: number; unchanged: number; warnings: number; imagesNotFetched: number };
type Job = { id: string; source_name: string; counts: Counts; created_at: string; status: string; after_version: number | null };
const STEPS = ["Choose file", "Match columns", "Review", "Done"] as const;
const ACTION_LABEL: Record<Action, string> = { new: "New", update: "Update", unchanged: "No change", skipped: "Skipped", invalid: "Not imported" };
const newKey = () => (globalThis.crypto?.randomUUID?.() ?? `k${Date.now()}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "");
const download = (name: string, text: string) => { const u = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv" })); const a = document.createElement("a"); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); };

export default function ImportWizard(p: { pageId: string; kind: ImportKind; currency: Currency; categories: Category[]; version: number; maxRows: number; history: Job[]; draftVersionNow: number; onPageHref: string }) {
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<{ name: string; notes: string[]; sheets: Sheet[] } | null>(null);
  const [sheetIx, setSheetIx] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [map, setMap] = useState<Mapping>({});
  const [opt, setOpt] = useState<Options>({ mode: "both", fields: ["name", "description", "price", "status", "category", "tags", "link"].filter((f) => f !== (p.kind === "menu" ? "link" : "tags")) as Field[], duplicates: "skip" });
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"all" | "problem" | "new" | "update">("all");
  const [msg, setMsg] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState<"" | "reading" | "importing">("");
  const [done, setDone] = useState<{ counts: Counts; jobId?: string; version?: number; replayed?: boolean; noChanges?: boolean } | null>(null);
  const [undone, setUndone] = useState(false);
  const key = useRef(newKey()); const abort = useRef<AbortController | null>(null); const live = useRef<HTMLHeadingElement>(null);
  const labels = FIELD_LABEL(p.kind);
  const kindWord = p.kind === "menu" ? "menu" : "catalogue";

  const sheet = parsed?.sheets[sheetIx];
  const rows = useMemo(() => (sheet ? sheet.rows.map((r, i) => (i > headerRow ? r.map((c, j) => edits[`${i}:${j}`] ?? c) : r)) : []), [sheet, edits, headerRow]);
  const headers = sheet ? (sheet.rows[headerRow] ?? []).map((h, i) => (h.trim() ? h.trim() : `Column ${i + 1}`)) : [];
  const results = useMemo(() => (sheet ? interpretRows(rows, headerRow, map, p.kind, p.currency) : []), [rows, headerRow, map, p.kind, p.currency, sheet]);
  const plan = useMemo(() => planImport({ currency: p.currency, categories: p.categories }, results, p.kind, opt, p.maxRows), [results, p.currency, p.categories, p.kind, opt, p.maxRows]);
  const itemsAfter = plan.next.reduce((n, c) => n + c.items.length, 0), itemsNow = p.categories.reduce((n, c) => n + c.items.length, 0);
  const canRun = plan.counts.added + plan.counts.updated > 0 && (map.name !== undefined || map.id !== undefined || map.ref !== undefined);

  function go(n: number) { setStep(n); setTimeout(() => live.current?.focus(), 0); }
  async function read(f: File) {
    setBusy("reading"); setMsg(null); setFile(f); setEdits({}); key.current = newKey();
    try {
      const fd = new FormData(); fd.set("file", f);
      const r = await fetch(`/api/pages/${p.pageId}/import/parse`, { method: "POST", body: fd }); const j = await r.json().catch(() => ({}));
      if (!r.ok) { setParsed(null); setMsg({ tone: "error", text: j.error ?? "We couldn’t read that file." }); setBusy(""); return; }
      setParsed(j); setSheetIx(0); startSheet(j.sheets[0]); go(1);
    } catch { setMsg({ tone: "error", text: "We couldn’t reach Qrenuvi. Check your connection and choose the file again." }); }
    setBusy("");
  }
  function startSheet(s: Sheet) { const h = detectHeaderRow(s.rows, p.kind); setHeaderRow(h); setMap(autoMap(s.rows[h] ?? [], p.kind)); setEdits({}); }
  async function run() {
    if (!file || busy) return;
    setBusy("importing"); setMsg(null); abort.current = new AbortController();
    const editsList = Object.entries(edits).map(([k, v]) => { const [r, c] = k.split(":").map(Number); return [r, c, v]; });
    const fd = new FormData(); fd.set("file", file);
    fd.set("spec", JSON.stringify({ sheet: sheetIx, headerRow, mapping: map, options: opt, edits: editsList, key: key.current, expectedVersion: p.version }));
    try {
      const r = await fetch(`/api/pages/${p.pageId}/import/apply`, { method: "POST", body: fd, signal: abort.current.signal }); const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ tone: "error", text: (j.error ?? "The import didn’t finish. Nothing was changed.") + (j.code === "conflict" ? "" : " Your choices are kept; you can try again.") }); setBusy(""); return; }
      setDone(j); go(3);
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).name === "AbortError" ? "Import cancelled. If it had already finished it will show under Recent imports; trying again is safe and never adds anything twice." : "We lost the connection. Trying again is safe: it will not add anything twice." });
    }
    setBusy("");
  }
  async function undo(jobId: string) {
    setBusy("importing"); setMsg(null);
    try { const r = await fetch(`/api/pages/${p.pageId}/import/undo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId }) }); const j = await r.json().catch(() => ({}));
      if (r.ok) { setUndone(true); setMsg({ tone: "info", text: "The page is back as it was before this import." }); } else setMsg({ tone: "error", text: j.error ?? "We couldn’t undo that." });
    } catch { setMsg({ tone: "error", text: "We couldn’t reach Qrenuvi. Try again." }); }
    setBusy("");
  }
  const shown = plan.rows.filter((r) => filter === "all" || (filter === "problem" ? r.action === "invalid" || r.warnings.length > 0 : r.action === filter));
  const sample = (f: Field) => (map[f] === undefined ? "" : (rows[headerRow + 1]?.[map[f]!] ?? ""));

  return (
    <div>
      <ol className="mb-6 flex flex-wrap gap-2" aria-label="Import steps">
        {STEPS.map((s, i) => <li key={s} aria-current={i === step ? "step" : undefined} className={`rounded-control px-3 py-1.5 text-sm ${i === step ? "bg-brand text-white" : i < step ? "bg-soft text-brand" : "bg-soft text-muted"}`}>{i + 1}. {s}</li>)}
      </ol>
      <h2 ref={live} tabIndex={-1} className="mb-4 text-xl font-medium outline-none">{STEPS[step]}</h2>
      {msg ? <Notice tone={msg.tone === "error" ? "error" : "info"} live>{msg.text}</Notice> : null}

      {step === 0 ? (
        <div className="max-w-[720px]">
          <p className="mb-4 text-muted">Add or update the {kindWord} items in your <strong>draft</strong> from a spreadsheet. Nothing goes live until you publish, and your published page is never changed by an import.</p>
          <div className="mb-5 rounded-panel bg-surface p-5">
            <h3 className="mb-2 font-medium">1. Start from a template (optional)</h3>
            <p className="mb-3 text-sm text-muted">The example rows are marked and skipped on import, so you can leave them in.</p>
            <div className="flex flex-wrap gap-2">
              <LinkButton href={`/api/pages/${p.pageId}/import/file?what=template&format=csv`} variant="secondary" download>Template (CSV)</LinkButton>
              <LinkButton href={`/api/pages/${p.pageId}/import/file?what=template&format=xlsx`} variant="secondary" download>Template (Excel)</LinkButton>
              <LinkButton href={`/api/pages/${p.pageId}/import/file?what=items&format=xlsx`} variant="secondary" download>Export current items (Excel)</LinkButton>
            </div>
            <p className="mt-3 text-sm text-muted">To change existing items in bulk, export them first. The exported <em>Item ID</em> column lets the import find the same items again.</p>
          </div>
          <div className="rounded-panel bg-surface p-5">
            <h3 className="mb-2 font-medium">2. Choose your file</h3>
            <label htmlFor="imp-file" className="mb-1 block text-sm font-medium">CSV or Excel (.xlsx) file, up to 2 MB</label>
            <input id="imp-file" type="file" accept=".csv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy !== ""} className={`${controlClass} bg-surface`} onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); }} />
            <p role="status" className="mt-2 text-sm text-muted">{busy === "reading" ? "Reading your file…" : "Formulas, macros and links to other workbooks are never run or followed; only the values in the file are read."}</p>
          </div>
          <p className="mt-4 text-sm text-muted">This release imports from CSV and Excel. Image addresses are noted but pictures are not downloaded; add photos in the editor. Importing from a website is not available yet.</p>
          {p.history.length ? <Recent history={p.history} current={p.draftVersionNow} onUndo={undo} busy={busy !== ""} /> : null}
        </div>
      ) : null}

      {step === 1 && parsed && sheet ? (
        <div>
          {parsed.notes.map((n) => <Notice key={n} tone="warning">{n}</Notice>)}
          <p className="mb-4 text-muted">{parsed.name} · {Math.max(0, sheet.rows.length - headerRow - 1)} rows. Check that each field is read from the right column.</p>
          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            {parsed.sheets.length > 1 ? (
              <div><label htmlFor="imp-sheet" className="mb-1 block text-sm font-medium">Sheet</label>
                <select id="imp-sheet" className={`${controlClass} bg-surface`} value={sheetIx} onChange={(e) => { const i = Number(e.target.value); setSheetIx(i); startSheet(parsed.sheets[i]); }}>{parsed.sheets.map((s, i) => <option key={i} value={i}>{s.name} ({s.rows.length} rows)</option>)}</select></div>
            ) : null}
            <div><label htmlFor="imp-head" className="mb-1 block text-sm font-medium">Headings are on row</label>
              <select id="imp-head" className={`${controlClass} bg-surface`} value={headerRow} onChange={(e) => { const h = Number(e.target.value); setHeaderRow(h); setMap(autoMap(sheet.rows[h] ?? [], p.kind)); setEdits({}); }}>{sheet.rows.slice(0, 10).map((r, i) => <option key={i} value={i}>Row {i + 1}: {r.filter(Boolean).slice(0, 3).join(", ").slice(0, 40)}</option>)}</select></div>
          </div>
          <fieldset className="mb-6 rounded-panel bg-surface p-4">
            <legend className="px-1 font-medium">Match columns to fields</legend>
            <ul className="divide-y divide-line">
              {fieldsFor(p.kind).map((f) => (
                <li key={f} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:items-center">
                  <label htmlFor={`map-${f}`} className="text-sm font-medium">{labels[f]}{f === "name" ? <span className="text-danger"> *</span> : null}</label>
                  <div className="min-w-0">
                    <select id={`map-${f}`} className={`${controlClass} bg-surface`} value={map[f] ?? ""} onChange={(e) => setMap((m) => { const n = { ...m }; if (e.target.value === "") delete n[f]; else n[f] = Number(e.target.value); return n; })}>
                      <option value="">Don’t import</option>{headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                    </select>
                    {map[f] !== undefined ? <p className="mt-1 break-words text-xs text-muted">Example: {sample(f) ? `“${sample(f).slice(0, 60)}”` : "(empty)"}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          </fieldset>
          <fieldset className="mb-6 rounded-panel bg-surface p-4">
            <legend className="px-1 font-medium">What should the import do?</legend>
            {([["both", "Add new items and update matched items"], ["add", "Add new items only"], ["update", "Update matched items only"]] as const).map(([v, t]) => (
              <label key={v} className="mb-2 flex items-start gap-2 text-sm"><input type="radio" name="mode" className="mt-1" checked={opt.mode === v} onChange={() => setOpt((o) => ({ ...o, mode: v }))} />{t}</label>))}
            <p className="mb-3 text-sm text-muted">Items are matched by Item ID, then by item code. A name alone never matches, and rows missing from the file never delete anything.</p>
            {opt.mode !== "add" ? (
              <div className="mb-3"><p className="mb-1 text-sm font-medium">Fields an update may replace</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1">{UPDATABLE.filter((f) => f !== "ref" || true).filter((f) => !(p.kind === "menu" && f === "link") && !(p.kind === "product" && f === "tags")).map((f) => (
                  <label key={f} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={opt.fields.includes(f)} onChange={(e) => setOpt((o) => ({ ...o, fields: e.target.checked ? [...o.fields, f] : o.fields.filter((x) => x !== f) }))} />{labels[f]}</label>))}</div>
                <p className="mt-1 text-xs text-muted">Empty cells never erase existing values. Photos and anything you didn’t map are kept.</p></div>
            ) : null}
            {opt.mode !== "update" ? (
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={opt.duplicates === "add"} onChange={(e) => setOpt((o) => ({ ...o, duplicates: e.target.checked ? "add" : "skip" }))} />Add rows even if an item with the same name and category already exists (and the row has no code)</label>
            ) : null}
          </fieldset>
          <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => go(0)}>Back</Button><Button onClick={() => go(2)} disabled={map.name === undefined && map.id === undefined && map.ref === undefined}>Review</Button></div>
        </div>
      ) : null}

      {step === 2 ? (
        <div>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5" role="group" aria-label="Import summary">
            {([["New", plan.counts.added], ["Updated", plan.counts.updated], ["No change", plan.counts.unchanged], ["Skipped", plan.counts.skipped], ["Not imported", plan.counts.invalid]] as const).map(([k, v]) => <div key={k} className="rounded-control bg-surface p-3"><div className="text-2xl font-semibold">{v}</div><div className="text-sm text-muted">{k}</div></div>)}
          </div>
          <p className="mb-2 text-sm text-muted">Valid rows: {plan.counts.valid} of {plan.counts.rows}. Items on this page: {itemsNow} → {itemsAfter} (a {kindWord} holds up to {MAX_ITEMS}). Your plan allows {p.maxRows} rows per import. Pages: no new pages are created. Photos: none are changed.</p>
          {plan.imagesPending ? <Notice tone="warning">{plan.imagesPending} rows have image addresses. Pictures are not downloaded by this import; add them in the editor.</Notice> : null}
          <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filter rows">
            {([["all", "All"], ["problem", "Problems"], ["new", "New"], ["update", "Updates"]] as const).map(([v, t]) => <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)} className={`rounded-control px-3 py-1.5 text-sm ${filter === v ? "bg-brand text-white" : "bg-soft"}`}>{t}</button>)}
            {plan.counts.invalid || plan.counts.warnings ? <Button variant="secondary" onClick={() => download("import-problems.csv", toCsv(errorReport(plan, headers)))}>Download error report</Button> : null}
          </div>
          {shown.length === 0 ? <p className="rounded-control bg-surface p-4 text-muted">No rows to show here.</p> : (
            <ul className="mb-6 space-y-2">
              {shown.slice(0, 200).map((r) => <RowCard key={r.line} r={r} map={map} headers={headers} edits={edits} labels={labels} setEdit={(rowIx, col, v) => setEdits((e) => ({ ...e, [`${rowIx}:${col}`]: v }))} />)}
            </ul>
          )}
          {shown.length > 200 ? <p className="mb-4 text-sm text-muted">Showing the first 200 of {shown.length}. The error report lists every problem.</p> : null}
          {!canRun ? <Notice tone="warning" live>Nothing would change yet. Fix the problems above or go back and change your choices.</Notice> : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => go(1)} disabled={busy !== ""}>Back</Button>
            <Button onClick={run} disabled={!canRun || busy !== ""}>{busy === "importing" ? "Importing…" : `Import ${plan.counts.added + plan.counts.updated} into draft`}</Button>
            {busy === "importing" ? <Button variant="secondary" onClick={() => abort.current?.abort()}>Cancel</Button> : null}
          </div>
          <p role="status" className="mt-2 text-sm text-muted">{busy === "importing" ? "Importing… you can cancel; retrying later never adds anything twice." : "This changes your draft only. You review and publish separately."}</p>
        </div>
      ) : null}

      {step === 3 && done ? (
        <div className="max-w-[720px]">
          {done.noChanges ? <Notice tone="info">There was nothing to change, so your draft was left alone.</Notice> : <Notice title={undone ? "Import undone" : done.replayed ? "This import had already finished" : "Imported into your draft"} tone="info" live>{undone ? "Your draft is as it was before." : "Nothing is published yet. Open the editor to check the items and add photos, then publish when you’re happy."}</Notice>}
          <ul className="mb-5 space-y-1 text-sm"><li>{done.counts.added} added</li><li>{done.counts.updated} updated</li><li>{done.counts.unchanged} already up to date</li><li>{done.counts.skipped} skipped</li><li>{done.counts.invalid} not imported (see the error report)</li></ul>
          <div className="flex flex-wrap gap-2">
            <LinkButton href={p.onPageHref}>Open the editor</LinkButton>
            {done.counts.invalid || done.counts.warnings ? <Button variant="secondary" onClick={() => download("import-problems.csv", toCsv(errorReport(plan, headers)))}>Download error report</Button> : null}
            {done.jobId && !undone ? <Button variant="secondary" disabled={busy !== ""} onClick={() => undo(done.jobId!)}>Undo this import</Button> : null}
            <Button variant="secondary" onClick={() => { setDone(null); setFile(null); setParsed(null); setUndone(false); setMsg(null); key.current = newKey(); go(0); }}>Import another file</Button>
          </div>
          <p className="mt-3 text-sm text-muted">Undo works until you edit the draft again. After that, edit by hand or restore a published version.</p>
        </div>
      ) : null}
    </div>
  );
}

function RowCard({ r, map, headers, edits, labels, setEdit }: { r: PlanRow; map: Mapping; headers: string[]; edits: Record<string, string>; labels: Record<Field, string>; setEdit: (rowIx: number, col: number, v: string) => void }) {
  const bad = r.action === "invalid";
  const name = r.parsed.name || r.parsed.ref || r.parsed.id || `Row ${r.line}`;
  return (
    <li className={`min-w-0 rounded-control p-3 ${bad ? "bg-warning-bg" : "bg-surface"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2"><strong className="min-w-0 break-words">Row {r.line}: {name}</strong><span className={`text-sm ${bad ? "text-danger" : "text-muted"}`}>{ACTION_LABEL[r.action]}</span></div>
      <p className="mt-1 break-words text-sm text-muted">{r.reason}</p>
      {r.warnings.map((w) => <p key={w} className="break-words text-sm text-warning">{w}</p>)}
      {bad ? (
        <details className="mt-2"><summary className="cursor-pointer text-sm font-medium">Fix this row</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(Object.keys(map) as Field[]).filter((f) => f !== "imageUrl").map((f) => (
              <label key={f} className="min-w-0 text-sm"><span className="mb-1 block">{labels[f]}</span>
                <input className={`${controlClass} bg-surface`} value={edits[`${r.line - 1}:${map[f]}`] ?? r.cells[map[f]!] ?? ""} aria-label={`${labels[f]}, row ${r.line}, ${headers[map[f]!] ?? ""}`} onChange={(e) => setEdit(r.line - 1, map[f]!, e.target.value)} /></label>))}
          </div>
          <p className="mt-1 text-xs text-muted">Corrections apply to this import only; your file isn’t changed.</p></details>
      ) : null}
    </li>
  );
}

function Recent({ history, current, onUndo, busy }: { history: Job[]; current: number; onUndo: (id: string) => void; busy: boolean }) {
  return (
    <section className="mt-8" aria-labelledby="recent-h"><h3 id="recent-h" className="mb-2 font-medium">Recent imports</h3>
      <ul className="space-y-2">{history.map((j) => (
        <li key={j.id} className="rounded-control bg-surface p-3 text-sm"><span className="break-words">{j.source_name || "File"}</span> · {new Date(j.created_at).toLocaleString()} · {j.counts.added ?? 0} added, {j.counts.updated ?? 0} updated{j.status === "undone" ? " · undone" : ""}
          {j.status === "done" && j.after_version === current ? <Button variant="secondary" className="ml-2" disabled={busy} onClick={() => onUndo(j.id)}>Undo</Button> : null}</li>))}</ul>
      <p className="mt-2 text-xs text-muted">Undo is offered only while the draft is exactly as that import left it.</p>
    </section>
  );
}
