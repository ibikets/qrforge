import ActionBar from "@/components/pages/ActionBar";
import SocialIcons from "@/components/pages/SocialIcons";
import { ACCENTS, initials } from "@/lib/pages/card";
import { DAY_NAMES, type PageSnapshot, type PubBlock, type PubRow } from "@/lib/pages/blocks";

const act = "inline-flex min-h-12 items-center justify-center rounded-control border border-black/15 bg-white px-4 py-3 text-base font-medium text-ink no-underline hover:bg-soft";
const ext = (href: string) => (/^https?:\/\//i.test(href) ? { rel: "noopener noreferrer", target: "_blank" as const } : {});
const web = (href: unknown): href is string => typeof href === "string" && /^(https?:\/\/|tel:|mailto:)/i.test(href);

function Rows({ title, rows }: { title: string; rows: PubRow[] }) {
  const ok = rows.filter((r) => web(r.href) && typeof r.text === "string");
  if (!ok.length) return null;
  return (
    <ul aria-label={title} className="m-0 list-none divide-y divide-divider p-0">
      {ok.map((r) => (
        <li key={r.id}>
          <a href={r.href} {...ext(r.href)} className="flex min-h-12 flex-wrap items-center gap-x-2 break-all py-2 text-brand">
            {r.label ? <span className="text-sm capitalize text-muted">{r.label}</span> : null}
            <span>{r.text}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function Section({ b }: { b: PubBlock }) {
  switch (b.type) {
    case "text":
      return <section className="mb-6">{b.heading ? <h2 className="mb-1 text-sm font-medium text-muted">{b.heading}</h2> : null}<p className="whitespace-pre-line break-words text-base">{b.body}</p></section>;
    case "actions":
      return (
        <section aria-label="Contact" className="mb-6">
          <Rows title="Phone numbers" rows={b.phones} /><Rows title="Email addresses" rows={b.emails} /><Rows title="Websites" rows={b.websites} />
        </section>
      );
    case "links":
      return (
        <section className="mb-6">
          {b.heading ? <h2 className="mb-2 text-sm font-medium text-muted">{b.heading}</h2> : null}
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {b.items.filter((i) => web(i.href)).map((i) => (
              <li key={i.id}>
                <a href={i.href} {...ext(i.href)} className={`${act} w-full flex-col !items-start !text-left`}>
                  <span className="break-words">{i.label}</span>
                  {i.note ? <span className="break-words text-sm font-normal text-muted">{i.note}</span> : null}
                </a>
              </li>
            ))}
          </ul>
        </section>
      );
    case "socials":
      return <SocialIcons items={b.items} heading={b.heading} />;
    case "hours":
      return (
        <section aria-label="Opening hours" className="mb-6">
          <h2 className="mb-1 text-sm font-medium text-muted">Opening hours <span className="font-normal">({b.timezone.replace(/_/g, " ")} time)</span></h2>
          <table className="w-full text-base"><tbody>
            {b.days.map((d, i) => (
              <tr key={i} className="border-b border-divider last:border-0">
                <th scope="row" className="py-2 pr-3 text-left font-normal">{DAY_NAMES[i]}</th>
                <td className="py-2 text-right">{d.closed ? "Closed" : `${d.open} – ${d.close}`}</td>
              </tr>
            ))}
          </tbody></table>
          {b.note ? <p className="mt-2 whitespace-pre-line break-words text-sm text-muted">{b.note}</p> : null}
        </section>
      );
    case "location":
      return (
        <section aria-label="Location" className="mb-6">
          <h2 className="mb-1 text-sm font-medium text-muted">Find us</h2>
          <p className="mb-2 whitespace-pre-line break-words text-base">{b.address}</p>
          {b.note ? <p className="mb-2 break-words text-sm text-muted">{b.note}</p> : null}
          {web(b.mapHref) ? <a className={act} href={b.mapHref} rel="noopener noreferrer" target="_blank">Get directions</a> : null}
        </section>
      );
    case "button":
      return web(b.href) ? <p className="mb-6"><a className={`${act} w-full !border-transparent !bg-brand !text-white hover:!bg-brand-hover`} href={b.href} {...ext(b.href)}>{b.label}</a></p> : null;
    default: return null;
  }
}

/** A section-built page as a visitor sees it. Renders only a stored snapshot, as text. */
export default function BlocksView({ s, mediaBase, vcfHref, preview = false }: { s: PageSnapshot; mediaBase: string; vcfHref: string | null; preview?: boolean }) {
  const accent = ACCENTS.find((a) => a.id === s.accent) ?? ACCENTS[0];
  const head = s.blocks.find((b) => b.type === "header");
  if (head?.type !== "header") return null;
  const name = head.name || (preview ? "Your name" : "");
  const a = s.blocks.find((b) => b.type === "actions");
  const acts = a?.type === "actions" ? a : null;
  return (
    <article aria-label={`Page for ${name}`} className="mx-auto w-full max-w-[440px] overflow-hidden rounded-panel bg-surface shadow-[0_1px_0_rgba(0,0,0,.06)]">
      <header style={{ background: accent.bg, color: accent.fg }} className="px-6 pb-6 pt-8 text-center">
        {head.portraitId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${mediaBase}/${head.portraitId}`} width={128} height={128} alt={`Photo of ${name}`} className="mx-auto mb-4 size-32 rounded-full border-4 border-white/80 bg-white object-cover" />
        ) : head.logoId ? null : (
          <div role="img" aria-label={`${name}, no photo`} className="mx-auto mb-4 flex size-24 items-center justify-center rounded-full border-4 border-white/80 bg-white/20 text-3xl font-semibold">{initials(name)}</div>
        )}
        {head.logoId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${mediaBase}/${head.logoId}`} alt={`${name} logo`} className="mx-auto mb-3 max-h-20 w-auto max-w-[60%] rounded-control bg-white p-1.5" />
        ) : null}
        <h1 className="break-words text-[28px] font-semibold leading-tight tracking-[-0.5px]">{name}</h1>
        {head.tagline ? <p className="mt-1 break-words text-base opacity-95">{head.tagline}</p> : null}
      </header>
      <div className="px-6 py-6">
        <ActionBar title={`${name} on Qrenuvi`} phones={acts?.phones ?? []} emails={acts?.emails ?? []} websites={acts?.websites ?? []} vcfHref={vcfHref} preview={preview} showSave={s.kind === "business"} />
        {s.blocks.filter((b) => b.type !== "header").map((b) => <Section key={b.id} b={b} />)}
      </div>
      {preview ? <p className="bg-warning-bg px-6 py-3 text-center text-sm text-warning">Preview of your saved draft. Only you can see this.</p> : null}
    </article>
  );
}
