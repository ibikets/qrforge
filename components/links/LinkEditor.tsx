"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Dialog from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField, controlClass } from "@/components/ui/Field";
import { DAY_NAMES, DEVICE_LABEL, MAX_RULES, emptyRule, type RuleDevice, type Rules, type ScheduleRule } from "@/lib/links";

type Problems = Record<string, string>;
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function LinkEditor(p: { id: string; initialName: string; initialDestination: string; initialRules: Rules; version: number; state: "active" | "paused"; address: string; qrSvg: string; takenDown: boolean; canEdit: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(p.initialName);
  const [dest, setDest] = useState(p.initialDestination);
  const [ios, setIos] = useState(p.initialRules.ios ?? "");
  const [android, setAndroid] = useState(p.initialRules.android ?? "");
  const [sched, setSched] = useState<ScheduleRule[]>(p.initialRules.schedule ?? []);
  const [version, setVersion] = useState(p.version);
  const [state, setState] = useState(p.state);
  const [problems, setProblems] = useState<Problems>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  const [copied, setCopied] = useState(false);
  const locked = p.takenDown || !p.canEdit;

  const setRule = (id: string, patch: Partial<ScheduleRule>) => setSched((s) => s.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const rules = (): Rules => ({ ...(ios.trim() ? { ios } : {}), ...(android.trim() ? { android } : {}), ...(sched.length ? { schedule: sched } : {}) });

  async function send(body: Record<string, unknown>, okText: string) {
    setBusy(true); setMsg(null); setProblems({});
    try {
      const r = await fetch(`/api/links/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, version }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) { setVersion(j.version); setMsg({ ok: true, text: okText }); router.refresh(); return true; }
      if (j.problems) setProblems(j.problems); else if (j.field) setProblems({ [j.field]: j.error });
      setMsg({ ok: false, text: j.error ?? "We couldn’t save. Nothing was changed." });
    } catch { setMsg({ ok: false, text: "We couldn’t reach Qrenuvi. Nothing was saved." }); }
    finally { setBusy(false); }
    return false;
  }
  const save = () => send({ name, destination: dest, rules: rules() }, "Saved. The change is live now for everyone who scans this code.");
  async function toggle() {
    const next = state === "active" ? "paused" : "active";
    if (await send({ state: next }, next === "paused" ? "Paused. Visitors see a “switched off” notice." : "Resumed.")) setState(next);
  }
  async function remove() {
    setBusy(true);
    try {
      const r = await fetch(`/api/links/${p.id}`, { method: "DELETE" });
      if (r.ok) return router.push("/workspace/links");
      const j = await r.json().catch(() => ({}));
      setMsg({ ok: false, text: j.error ?? "We couldn’t delete it." });
    } catch { setMsg({ ok: false, text: "We couldn’t reach Qrenuvi. Nothing was deleted." }); }
    setBusy(false); setDel(false);
  }
  async function copy() { try { await navigator.clipboard.writeText(p.address); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); } }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        {p.takenDown ? <p role="alert" className="mb-4 rounded-control bg-soft p-3 text-sm text-danger">Qrenuvi disabled this link. It cannot be changed or reopened. Contact support if you think this is a mistake.</p> : null}
        {!p.canEdit && !p.takenDown ? <p role="status" className="mb-4 rounded-control bg-soft p-3 text-sm">Your plan no longer includes editing dynamic links. You can still pause or delete this one.</p> : null}
        <fieldset disabled={locked} className="m-0 min-w-0 border-0 p-0">
          <TextField id="le-name" label="Link name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} error={problems.name} help="For your own list. Visitors never see it." />
          <TextField id="le-dest" label="Main destination" value={dest} inputMode="url" autoCapitalize="none" autoCorrect="off" onChange={(e) => setDest(e.target.value)} error={problems.destination} help="Where everyone goes unless one of the options below applies." />

          <h2 className="mb-1 mt-2 text-xl font-medium">Send phones to an app store</h2>
          <p className="mb-4 text-sm text-muted">Optional. Phones are told apart by their browser’s name, so this is a best guess: it works for iPhone, iPad and Android, but a tablet that pretends to be a computer will get the main destination.</p>
          <TextField id="le-ios" label="iPhone and iPad" value={ios} inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="apps.apple.com/app/…" onChange={(e) => setIos(e.target.value)} error={problems.ios} />
          <TextField id="le-android" label="Android" value={android} inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="play.google.com/store/apps/details?id=…" onChange={(e) => setAndroid(e.target.value)} error={problems.android} />

          <h2 className="mb-1 mt-2 text-xl font-medium">Change the destination by day and time</h2>
          <p className="mb-4 text-sm text-muted">Optional, up to {MAX_RULES} rules. The first rule that matches wins, before the app-store addresses and the main destination. Times use the rule’s own time zone. A rule runs from the start time up to, but not including, the end time. For overnight, add one rule for late evening and one for early morning.</p>
          {problems.schedule ? <p role="alert" className="mb-3 text-sm text-danger">{problems.schedule}</p> : null}
          <ol className="m-0 mb-4 list-none space-y-4 p-0">
            {sched.map((r, i) => (
              <li key={r.id} className="rounded-panel border border-control-border p-4">
                <p className="mb-3 text-sm font-medium">Rule {i + 1}</p>
                <TextField id={`r-${r.id}-url`} label="Go to" value={r.url} inputMode="url" autoCapitalize="none" autoCorrect="off" onChange={(e) => setRule(r.id, { url: e.target.value })} error={problems[`rule.${r.id}.url`]} />
                <SelectField id={`r-${r.id}-dev`} label="For" value={r.device} onChange={(e) => setRule(r.id, { device: e.target.value as RuleDevice })}>
                  {(Object.keys(DEVICE_LABEL) as RuleDevice[]).map((d) => <option key={d} value={d}>{DEVICE_LABEL[d]}</option>)}
                </SelectField>
                <fieldset className="mb-6 min-w-0 border-0 p-0">
                  <legend className="mb-2 text-sm font-medium">On these days</legend>
                  <div className="flex flex-wrap gap-2">
                    {DAY_ORDER.map((d) => (
                      <label key={d} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-control-border px-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand">
                        <input type="checkbox" aria-label={DAY_NAMES[d]} checked={r.days.includes(d)} onChange={(e) => setRule(r.id, { days: e.target.checked ? [...r.days, d].sort() : r.days.filter((x) => x !== d) })} />
                        <span aria-hidden="true">{DAY_NAMES[d].slice(0, 3)}</span>
                      </label>
                    ))}
                  </div>
                  {problems[`rule.${r.id}.days`] ? <p className="mt-2 text-[13px] text-danger">{problems[`rule.${r.id}.days`]}</p> : null}
                </fieldset>
                <div className="grid grid-cols-2 gap-3">
                  <div><label htmlFor={`r-${r.id}-from`} className="mb-2 block text-sm font-medium">From</label><input id={`r-${r.id}-from`} type="time" className={controlClass} value={r.from} onChange={(e) => setRule(r.id, { from: e.target.value })} aria-invalid={problems[`rule.${r.id}.time`] ? true : undefined} /></div>
                  <div><label htmlFor={`r-${r.id}-to`} className="mb-2 block text-sm font-medium">Until</label><input id={`r-${r.id}-to`} type="time" className={controlClass} value={r.to} onChange={(e) => setRule(r.id, { to: e.target.value })} aria-invalid={problems[`rule.${r.id}.time`] ? true : undefined} /></div>
                </div>
                {problems[`rule.${r.id}.time`] ? <p className="mt-2 text-[13px] text-danger">{problems[`rule.${r.id}.time`]}</p> : null}
                <div className="mt-6"><TextField id={`r-${r.id}-tz`} label="Time zone" list="le-tz" value={r.timezone} onChange={(e) => setRule(r.id, { timezone: e.target.value })} error={problems[`rule.${r.id}.timezone`]} /></div>
                <Button variant="ghost" onClick={() => setSched((s) => s.filter((x) => x.id !== r.id))}>Remove rule {i + 1}</Button>
              </li>
            ))}
          </ol>
          <datalist id="le-tz">{(typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["Africa/Lagos", "UTC"]).map((z) => <option key={z} value={z} />)}</datalist>
          {sched.length < MAX_RULES ? <Button variant="secondary" onClick={() => setSched((s) => [...s, emptyRule()])}>Add a day and time rule</Button> : null}
        </fieldset>

        <div role="status" aria-live="polite" className="mt-6 min-h-6 text-sm">{msg && msg.ok ? <p className="text-brand">{msg.text}</p> : null}</div>
        {msg && !msg.ok ? <p role="alert" className="mt-2 text-sm text-danger">{msg.text}</p> : null}
        <div className="mt-4 flex flex-wrap gap-3">
          {!locked ? <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button> : null}
          {!p.takenDown ? <Button variant="secondary" onClick={toggle} disabled={busy}>{state === "active" ? "Pause link" : "Resume link"}</Button> : null}
          <Button variant="danger" onClick={() => setDel(true)} disabled={busy}>Delete link</Button>
        </div>
      </div>

      <aside className="min-w-0">
        <div className="rounded-panel bg-surface p-5">
          <h2 className="mb-3 text-lg font-medium">Permanent address</h2>
          <div role="img" aria-label="QR code for this link's permanent address" className="mx-auto mb-3 w-full max-w-[240px] [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: p.qrSvg }} />
          <p className="mb-3 break-all text-sm"><code>{p.address}</code></p>
          <p className="mb-3 text-[13px] text-muted">This address and its QR code never change when you edit the destination, so printed codes keep working.{state === "paused" ? " It is paused right now." : ""}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={copy}>{copied ? "Copied" : "Copy address"}</Button>
            <a className="inline-flex min-h-12 items-center rounded-control border border-brand px-5 text-base font-medium text-brand no-underline hover:bg-soft" href={`/api/links/${p.id}/qr?format=png`}>PNG</a>
            <a className="inline-flex min-h-12 items-center rounded-control border border-brand px-5 text-base font-medium text-brand no-underline hover:bg-soft" href={`/api/links/${p.id}/qr?format=svg`}>SVG</a>
          </div>
          <span role="status" aria-live="polite" className="sr-only">{copied ? "Address copied" : ""}</span>
        </div>
      </aside>

      <Dialog open={del} onClose={() => setDel(false)} title="Delete this link?">
        <p className="mb-4 text-muted">Anyone who scans a printed code for it will see “This link isn’t available”. Its address is never reused. This cannot be undone.</p>
        <div className="flex flex-wrap gap-3"><Button variant="secondary" data-autofocus onClick={() => setDel(false)}>Keep it</Button><Button variant="danger" onClick={remove} disabled={busy}>Delete link</Button></div>
      </Dialog>
    </div>
  );
}
