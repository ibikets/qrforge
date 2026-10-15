import { ACCENTS, initials, type Snapshot } from "@/lib/pages/card";
import ShareButton from "@/components/pages/ShareButton";

const act = "inline-flex min-h-12 items-center justify-center rounded-control border border-black/15 bg-white px-4 py-3 text-base font-medium text-ink no-underline hover:bg-soft";
const LABEL: Record<string, string> = { mobile: "Mobile", work: "Work", home: "Home" };

/**
 * The card as a recipient sees it. Renders only a stored snapshot, as text; every link is built by snapshotOf().
 * `mediaBase` is where images are served from (public route, or the owner's preview route).
 */
export default function CardView({ s, mediaBase, vcfHref, preview = false }: { s: Snapshot; mediaBase: string; vcfHref: string | null; preview?: boolean }) {
  const accent = ACCENTS.find((a) => a.id === s.accent) ?? ACCENTS[0];
  const phone = s.phones[0], wa = s.phones.find((p) => p.whatsapp), mail = s.emails[0], site = s.websites[0];
  const safeWeb = typeof site?.href === "string" && /^https?:\/\//i.test(site.href) ? site.href : null;
  return (
    <article aria-label={`Digital business card for ${s.name}`} className="mx-auto w-full max-w-[440px] overflow-hidden rounded-panel bg-surface shadow-[0_1px_0_rgba(0,0,0,.06)]">
      <header style={{ background: accent.bg, color: accent.fg }} className="px-6 pb-6 pt-8 text-center">
        {s.portraitId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${mediaBase}/${s.portraitId}`} width={128} height={128} alt={`Photo of ${s.name}`} className="mx-auto mb-4 size-32 rounded-full border-4 border-white/80 bg-white object-cover" />
        ) : (
          <div role="img" aria-label={`${s.name}, no photo`} className="mx-auto mb-4 flex size-32 items-center justify-center rounded-full border-4 border-white/80 bg-white/20 text-4xl font-semibold">{initials(s.name)}</div>
        )}
        <h1 className="break-words text-[28px] font-semibold leading-tight tracking-[-0.5px]">{s.name}</h1>
        {s.role || s.company ? <p className="mt-1 break-words text-base opacity-95">{[s.role, s.company].filter(Boolean).join(" · ")}</p> : null}
        {s.logoId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${mediaBase}/${s.logoId}`} alt={s.company ? `${s.company} logo` : "Company logo"} className="mx-auto mt-4 max-h-12 w-auto max-w-[60%] rounded-control bg-white p-1.5" />
        ) : null}
      </header>
      <div className="px-6 py-6">
        {s.intro ? <p className="mb-6 whitespace-pre-line break-words text-base">{s.intro}</p> : null}
        <div className="mb-6 grid grid-cols-2 gap-2">
          {phone ? <a className={act} href={phone.href}>Call</a> : null}
          {wa?.whatsapp ? <a className={act} href={wa.whatsapp} rel="noopener noreferrer" target="_blank">WhatsApp</a> : null}
          {mail ? <a className={act} href={mail.href}>Email</a> : null}
          {safeWeb ? <a className={act} href={safeWeb} rel="noopener noreferrer" target="_blank">Website</a> : null}
          <ShareButton title={`${s.name} on Qrenuvi`} className={act} />
          {vcfHref ? (
            <a className={`${act} !border-transparent !bg-brand !text-white hover:!bg-brand-hover`} href={vcfHref} download={`${s.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "contact"}.vcf`}>Save contact</a>
          ) : (
            <span className={`${act} opacity-60`} aria-disabled="true">Save contact (preview)</span>
          )}
        </div>
        {([
          ["Phone", s.phones.map((p) => ({ id: p.id, label: LABEL[p.label] ?? "", text: p.text, href: p.href }))],
          ["Email", s.emails.map((p) => ({ id: p.id, label: p.label === "home" ? "Personal" : "Work", text: p.text, href: p.href }))],
          ["Websites", s.websites.map((p) => ({ id: p.id, label: "", text: p.text, href: p.href }))],
          ["Social", s.socials.map((p) => ({ id: p.id, label: p.label, text: p.text, href: p.href }))],
        ] as const).map(([title, rows]) =>
          rows.length ? (
            <section key={title} aria-label={title} className="mb-4">
              <h2 className="mb-1 text-sm font-medium text-muted">{title}</h2>
              <ul className="m-0 list-none divide-y divide-divider p-0">
                {rows.filter((r) => typeof r.href === "string" && typeof r.text === "string").map((r) => (
                  <li key={r.id}>
                    <a href={r.href} {...(/^https?:\/\//i.test(r.href) ? { rel: "noopener noreferrer", target: "_blank" } : {})} className="flex min-h-12 flex-wrap items-center gap-x-2 break-all py-2 text-brand">
                      {r.label ? <span className="text-sm capitalize text-muted">{r.label}</span> : null}
                      <span>{r.text}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null
        )}
      </div>
      {preview ? <p className="bg-warning-bg px-6 py-3 text-center text-sm text-warning">Preview of your saved draft. Only you can see this.</p> : null}
    </article>
  );
}
