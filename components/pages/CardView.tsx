import { ACCENTS, type Snapshot } from "@/lib/pages/card";
import ActionBar from "@/components/pages/ActionBar";
import CardHeader from "@/components/pages/CardHeader";
import ContactRows from "@/components/pages/ContactRows";
import SocialIcons from "@/components/pages/SocialIcons";
import { cardVars } from "@/components/pages/card-theme";

const LABEL: Record<string, string> = { mobile: "Mobile", work: "Work", home: "Home" };

/**
 * The card as a recipient sees it. Renders only a stored snapshot, as text; every link is built by snapshotOf().
 * `mediaBase` is where images are served from (public route, or the owner's preview route).
 */
export default function CardView({ s, mediaBase, vcfHref, preview = false }: { s: Snapshot; mediaBase: string; vcfHref: string | null; preview?: boolean }) {
  const accent = ACCENTS.find((a) => a.id === s.accent) ?? ACCENTS[0];
  return (
    <article aria-label={`Digital business card for ${s.name}`} style={cardVars(accent)} className="qcard mx-auto w-full max-w-[440px] overflow-hidden rounded-panel bg-surface shadow-[0_1px_3px_rgba(0,0,0,.08)]">
      <CardHeader name={s.name} line={[s.role, s.company].filter(Boolean).join(" · ")} accentFg={accent.fg}
        portraitSrc={s.portraitId ? `${mediaBase}/${s.portraitId}` : null} logoSrc={s.logoId ? `${mediaBase}/${s.logoId}` : null} logoAlt={s.company ? `${s.company} logo` : "Company logo"} />
      <div className="relative -mt-5 rounded-t-[20px] bg-surface px-5 pb-6 pt-6">
        {s.intro ? <p className="mb-5 whitespace-pre-line break-words text-base leading-relaxed text-ink">{s.intro}</p> : null}
        <ActionBar title={`${s.name} on Qrenuvi`} phones={s.phones} emails={s.emails} websites={s.websites} vcfHref={vcfHref} preview={preview} />
        <ContactRows title="Phone" kind="phone" rows={s.phones.map((p) => ({ id: p.id, label: LABEL[p.label] ?? "", text: p.text, href: p.href }))} />
        <ContactRows title="Email" kind="email" rows={s.emails.map((p) => ({ id: p.id, label: p.label === "home" ? "Personal" : "Work", text: p.text, href: p.href }))} />
        <ContactRows title="Websites" kind="website" rows={s.websites.map((p) => ({ id: p.id, label: "", text: p.text, href: p.href }))} />
        <SocialIcons items={s.socials} />
      </div>
      {preview ? <p className="bg-warning-bg px-5 py-2 text-center text-xs text-warning">Preview of your saved draft. Only you can see this.</p> : null}
    </article>
  );
}
