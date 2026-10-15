import { LuDownload, LuExternalLink } from "react-icons/lu";
import ActionBar from "@/components/pages/ActionBar";
import GalleryView from "@/components/pages/GalleryView";
import CardHeader from "@/components/pages/CardHeader";
import ContactRows from "@/components/pages/ContactRows";
import SocialIcons from "@/components/pages/SocialIcons";
import { cardVars } from "@/components/pages/card-theme";
import { ACCENTS } from "@/lib/pages/card";
import { DAY_NAMES, type FileMeta, type PageSnapshot, type PubBlock } from "@/lib/pages/blocks";

const act = "inline-flex min-h-12 items-center justify-center rounded-control border border-[var(--qc-line)] bg-white px-4 py-3 text-base font-medium text-ink no-underline hover:bg-[var(--qc-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--qc-accent)]";
const ext = (href: string) => (/^https?:\/\//i.test(href) ? { rel: "noopener noreferrer", target: "_blank" as const } : {});
const web = (href: unknown): href is string => typeof href === "string" && /^(https?:\/\/|tel:|mailto:)/i.test(href);

const size = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const info = (m: FileMeta | null) => (m ? `PDF · ${size(m.bytes)}${m.pages ? ` · ${m.pages} page${m.pages === 1 ? "" : "s"}` : ""}` : "");

/** One download/open action. Hosted PDFs are download-only (never previewed inline); external links say where they go. */
function FileAction({ label, fileId, href, host, meta, fileBase, primary = true }: { label: string; fileId: string | null; href: string | null; host: string | null; meta: FileMeta | null; fileBase: string; primary?: boolean }) {
  const cls = `${act} w-full gap-2 ${primary ? "!border-transparent !bg-[var(--qc-accent)] !text-white hover:brightness-110" : ""}`;
  if (fileId) {
    const detail = info(meta);
    return (
      <div>
        <a className={cls} href={`${fileBase}/${fileId}`} aria-label={detail ? `${label} (${detail})` : label}><LuDownload aria-hidden="true" size={20} /> <span>{label}</span></a>
        {detail ? <p className="mt-1 text-center text-[13px] text-muted">{detail}</p> : null}
      </div>
    );
  }
  if (href && /^https:\/\//i.test(href))
    return (
      <div>
        <a className={cls} href={href} rel="noopener noreferrer" target="_blank" aria-label={`${label} (opens ${host ?? "another site"} in a new tab)`}><LuExternalLink aria-hidden="true" size={20} /> <span>{label}</span></a>
        <p className="mt-1 text-center text-[13px] text-muted">Opens on {host ?? "another site"}</p>
      </div>
    );
  return null;
}

function Section({ b, fileBase, mediaBase }: { b: PubBlock; fileBase: string; mediaBase: string }) {
  switch (b.type) {
    case "text":
      return <section className="mb-6">{b.heading ? <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--qc-accent)]">{b.heading}</h2> : null}<p className="whitespace-pre-line break-words text-base">{b.body}</p></section>;
    case "actions":
      return (
        <section aria-label="Contact" className="mb-6">
          <ContactRows title="Phone" label="Phone numbers" kind="phone" rows={b.phones} /><ContactRows title="Email" label="Email addresses" kind="email" rows={b.emails} /><ContactRows title="Websites" kind="website" rows={b.websites} />
        </section>
      );
    case "links":
      return (
        <section className="mb-6">
          {b.heading ? <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--qc-accent)]">{b.heading}</h2> : null}
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
          <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--qc-accent)]">Opening hours <span className="font-normal">({b.timezone.replace(/_/g, " ")} time)</span></h2>
          <table className="w-full text-base"><tbody>
            {b.days.map((d, i) => (
              <tr key={i} className="border-b border-[var(--qc-line)] last:border-0">
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
          <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--qc-accent)]">Find us</h2>
          <p className="mb-2 whitespace-pre-line break-words text-base">{b.address}</p>
          {b.note ? <p className="mb-2 break-words text-sm text-muted">{b.note}</p> : null}
          {web(b.mapHref) ? <a className={act} href={b.mapHref} rel="noopener noreferrer" target="_blank">Get directions</a> : null}
        </section>
      );
    case "button":
      return web(b.href) ? <p className="mb-6"><a className={`${act} w-full !border-transparent !bg-[var(--qc-accent)] !text-white hover:brightness-110`} href={b.href} {...ext(b.href)}>{b.label}</a></p> : null;
    case "file":
      return (
        <section aria-label={b.heading || b.label} className="mb-6">
          {b.heading ? <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--qc-accent)]">{b.heading}</h2> : null}
          {b.description ? <p className="mb-3 whitespace-pre-line break-words text-base">{b.description}</p> : null}
          <FileAction label={b.label} fileId={b.fileId} href={b.href} host={b.host} meta={b.meta} fileBase={fileBase} />
        </section>
      );
    case "documents":
      return (
        <section aria-label={b.heading || "Documents"} className="mb-6">
          {b.heading ? <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--qc-accent)]">{b.heading}</h2> : null}
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {b.items.map((i) => (
              <li key={i.id} className="rounded-control border border-[var(--qc-line)] p-4">
                <h3 className="break-words text-base font-medium">{i.title}</h3>
                {i.description ? <p className="mb-3 mt-1 whitespace-pre-line break-words text-sm text-muted">{i.description}</p> : <div className="mb-3" />}
                <FileAction label={i.fileId ? "Download" : "Open"} fileId={i.fileId} href={i.href} host={i.host} meta={i.meta} fileBase={fileBase} primary={false} />
              </li>
            ))}
          </ul>
        </section>
      );
    case "gallery":
      return <GalleryView items={b.items} mediaBase={mediaBase} heading={b.heading} />;
    case "entries":
      return (
        <section aria-label={b.heading || "Entries"} className="mb-6">
          {b.heading ? <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--qc-accent)]">{b.heading}</h2> : null}
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {b.items.map((i) => (
              <li key={i.id}>
                <p className="break-words text-base font-medium">{i.title}</p>
                {i.org || i.period ? <p className="break-words text-sm text-muted">{[i.org, i.period].filter(Boolean).join(" · ")}</p> : null}
                {i.summary ? <p className="mt-1 whitespace-pre-line break-words text-base">{i.summary}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      );
    default: return null;
  }
}

/** A section-built page as a visitor sees it. Renders only a stored snapshot, as text. */
export default function BlocksView({ s, mediaBase, fileBase, vcfHref, preview = false }: { s: PageSnapshot; mediaBase: string; fileBase: string; vcfHref: string | null; preview?: boolean }) {
  const accent = ACCENTS.find((a) => a.id === s.accent) ?? ACCENTS[0];
  const head = s.blocks.find((b) => b.type === "header");
  if (head?.type !== "header") return null;
  const name = head.name || (preview ? "Your name" : "");
  const a = s.blocks.find((b) => b.type === "actions");
  const acts = a?.type === "actions" ? a : null;
  return (
    <article aria-label={`Page for ${name}`} style={cardVars(accent)} className="qcard mx-auto w-full max-w-[440px] overflow-hidden rounded-panel bg-surface shadow-[0_1px_3px_rgba(0,0,0,.08)]">
      {head.coverId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`${mediaBase}/${head.coverId}`} alt="" width={440} height={220} className="aspect-[2/1] w-full object-cover" />
      ) : null}
      <CardHeader name={name} line={head.tagline} accentFg={accent.fg} portraitSrc={head.portraitId ? `${mediaBase}/${head.portraitId}` : null}
        logoSrc={head.logoId ? `${mediaBase}/${head.logoId}` : null} logoAlt={`${name} logo`} />
      <div className="relative -mt-5 rounded-t-[20px] bg-surface px-5 pb-6 pt-6">
        <ActionBar title={`${name} on Qrenuvi`} phones={acts?.phones ?? []} emails={acts?.emails ?? []} websites={acts?.websites ?? []} vcfHref={vcfHref} preview={preview} showSave={s.kind === "business"} />
        {s.blocks.filter((b) => b.type !== "header").map((b) => <Section key={b.id} b={b} fileBase={fileBase} mediaBase={mediaBase} />)}
      </div>
      {preview ? <p className="bg-warning-bg px-6 py-3 text-center text-sm text-warning">Preview of your saved draft. Only you can see this.</p> : null}
    </article>
  );
}
