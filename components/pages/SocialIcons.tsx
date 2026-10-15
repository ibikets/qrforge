import type { CSSProperties } from "react";
import type { IconType } from "react-icons";
import { FaFacebookF, FaGithub, FaInstagram, FaLinkedinIn, FaTiktok, FaXTwitter, FaYoutube } from "react-icons/fa6";
import { LuLink } from "react-icons/lu";
import { FOCUS } from "@/components/pages/card-theme";

/** Each platform's own identity colour. Instagram uses its multicolour gradient; X and TikTok stay black; unknown links follow the card accent. */
const ICONS: Record<string, { Icon: IconType; name: string; color?: string; gradient?: boolean }> = {
  instagram: { Icon: FaInstagram, name: "Instagram", gradient: true }, linkedin: { Icon: FaLinkedinIn, name: "LinkedIn", color: "#0a66c2" },
  x: { Icon: FaXTwitter, name: "X", color: "#000000" }, facebook: { Icon: FaFacebookF, name: "Facebook", color: "#1877f2" },
  tiktok: { Icon: FaTiktok, name: "TikTok", color: "#000000" }, youtube: { Icon: FaYoutube, name: "YouTube", color: "#ff0000" },
  github: { Icon: FaGithub, name: "GitHub", color: "#181717" },
};
export type SocialItem = { id: string; label: string; text: string; href: string };
const GRAD = "qc-ig-gradient";

/** Social profiles as brand-coloured icons in a balanced, wrapping row (44px+ targets). Every profile is listed; the accessible name carries platform and handle. */
export default function SocialIcons({ items, heading }: { items: SocialItem[]; heading?: string }) {
  const ok = items.filter((i) => typeof i.href === "string" && /^https?:\/\//i.test(i.href) && typeof i.text === "string");
  if (!ok.length) return null;
  const hasIg = ok.some((i) => ICONS[i.label]?.gradient);
  return (
    <section aria-label={heading || "Social profiles"} className="mb-2 border-t border-[var(--qc-line)] pt-5">
      {hasIg ? (
        <svg width="0" height="0" aria-hidden="true" focusable="false" className="absolute">
          <defs>
            <linearGradient id={GRAD} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#feda75" /><stop offset=".3" stopColor="#fa7e1e" /><stop offset=".55" stopColor="#d62976" /><stop offset=".8" stopColor="#962fbf" /><stop offset="1" stopColor="#4f5bd5" />
            </linearGradient>
          </defs>
        </svg>
      ) : null}
      <h2 className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.08em] text-[var(--qc-accent)]">{heading || "Find me online"}</h2>
      <ul className="m-0 flex list-none flex-wrap justify-center gap-3 p-0">
        {ok.map((i) => {
          const b = ICONS[i.label];
          const Icon = b?.Icon ?? LuLink;
          const name = `${b?.name ?? "Link"}: ${i.text}`;
          const style: CSSProperties = b?.gradient ? { fill: `url(#${GRAD})` } : { color: b?.color ?? "var(--qc-accent)" };
          return (
            <li key={i.id}>
              <a href={i.href} rel="noopener noreferrer" target="_blank" aria-label={name} title={name}
                className={`inline-flex size-12 items-center justify-center rounded-full border border-[var(--qc-line)] bg-white no-underline shadow-[0_1px_2px_rgba(0,0,0,.06)] hover:bg-[var(--qc-tint)] ${FOCUS}`}>
                <Icon aria-hidden="true" size={22} style={style} />
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
