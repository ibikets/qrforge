import type { summarise } from "@/lib/links";

type S = ReturnType<typeof summarise>;
const nf = (n: number) => n.toLocaleString("en-US");

/** Honest engagement numbers. "Opens" are requests to the link: not people, not unique visitors, not proof of a QR scan. */
export default function LinkStats({ s }: { s: S }) {
  const max = Math.max(1, ...s.series.map((x) => x.opens));
  return (
    <section aria-labelledby="stats-h" className="mt-10 rounded-panel bg-surface p-6">
      <h2 id="stats-h" className="mb-1 text-xl font-medium">Opens, last {s.days} days</h2>
      <p className="mb-4 max-w-[720px] text-sm text-muted">An <strong>open</strong> is one request to this link’s address. It is not a person: the same person opening twice counts twice, and a QR scan, a tapped link and a typed address all look the same. Link previews and known robots are counted apart as “previews”. Days follow UTC. We store no names, addresses or cookies.</p>
      <dl className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[["Opens", s.opens], ["All-time opens", s.allTime], ["Previews and robots", s.previews], ["Opens while paused", s.byTarget.paused]].map(([k, v]) => (
          <div key={String(k)}><dt className="text-sm text-muted">{k}</dt><dd className="m-0 text-3xl font-semibold">{nf(Number(v))}</dd></div>
        ))}
      </dl>
      <div role="img" aria-label={`Opens per day for the last ${s.days} days. Total ${s.opens}.`} className="mb-6 flex h-24 items-end gap-[2px]">
        {s.series.map((x) => <div key={x.day} title={`${x.day}: ${x.opens}`} className="min-w-[3px] flex-1 rounded-t bg-brand" style={{ height: `${Math.max(2, (x.opens / max) * 100)}%`, opacity: x.opens ? 1 : 0.25 }} />)}
      </div>
      <table className="w-full max-w-[560px] border-collapse text-left text-sm">
        <caption className="mb-2 text-left font-medium">Where opens were sent</caption>
        <thead><tr className="border-b border-divider"><th scope="col" className="py-2 pr-4">Sent to</th><th scope="col" className="py-2 text-right">Opens</th></tr></thead>
        <tbody>
          {[["Main destination", s.byTarget.default], ["App-store address for the phone", s.byTarget.device], ["A day and time rule", s.byTarget.schedule]].map(([k, v]) => <tr key={String(k)} className="border-b border-divider"><th scope="row" className="py-2 pr-4 font-normal">{k}</th><td className="py-2 text-right">{nf(Number(v))}</td></tr>)}
        </tbody>
      </table>
      <table className="mt-6 w-full max-w-[560px] border-collapse text-left text-sm">
        <caption className="mb-2 text-left font-medium">Device (from the browser’s name; best guess)</caption>
        <thead><tr className="border-b border-divider"><th scope="col" className="py-2 pr-4">Device</th><th scope="col" className="py-2 text-right">Opens</th></tr></thead>
        <tbody>
          {[["iPhone or iPad", s.byDevice.ios], ["Android", s.byDevice.android], ["Computer or other", s.byDevice.other]].map(([k, v]) => <tr key={String(k)} className="border-b border-divider"><th scope="row" className="py-2 pr-4 font-normal">{k}</th><td className="py-2 text-right">{nf(Number(v))}</td></tr>)}
        </tbody>
      </table>
    </section>
  );
}
