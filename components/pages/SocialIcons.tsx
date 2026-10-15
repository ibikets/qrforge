import type { IconType } from "react-icons";
import { FaFacebookF, FaGithub, FaInstagram, FaLinkedinIn, FaTiktok, FaXTwitter, FaYoutube } from "react-icons/fa6";
import { LuLink } from "react-icons/lu";

const ICONS: Record<string, { Icon: IconType; name: string }> = {
  instagram: { Icon: FaInstagram, name: "Instagram" }, linkedin: { Icon: FaLinkedinIn, name: "LinkedIn" }, x: { Icon: FaXTwitter, name: "X" },
  facebook: { Icon: FaFacebookF, name: "Facebook" }, tiktok: { Icon: FaTiktok, name: "TikTok" }, youtube: { Icon: FaYoutube, name: "YouTube" }, github: { Icon: FaGithub, name: "GitHub" },
};
export type SocialItem = { id: string; label: string; text: string; href: string };

/** Social profiles as brand icons (44px+ targets). Every profile is listed; the accessible name carries platform and handle. */
export default function SocialIcons({ items, heading }: { items: SocialItem[]; heading?: string }) {
  const ok = items.filter((i) => typeof i.href === "string" && /^https?:\/\//i.test(i.href) && typeof i.text === "string");
  if (!ok.length) return null;
  return (
    <section aria-label={heading || "Social profiles"} className="mb-6">
      {heading ? <h2 className="mb-2 text-sm font-medium text-muted">{heading}</h2> : null}
      <ul className="m-0 flex list-none flex-wrap justify-center gap-3 p-0">
        {ok.map((i) => {
          const b = ICONS[i.label];
          const Icon = b?.Icon ?? LuLink;
          const name = `${b?.name ?? "Link"}: ${i.text}`;
          return (
            <li key={i.id}>
              <a href={i.href} rel="noopener noreferrer" target="_blank" aria-label={name} title={name}
                className="inline-flex size-12 items-center justify-center rounded-full border border-black/15 bg-white text-ink no-underline hover:bg-soft focus-visible:outline-2 focus-visible:outline-offset-2">
                <Icon aria-hidden="true" size={22} />
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
