import { initials } from "@/lib/pages/card";

/** Identity block shared by every published card and its preview: portrait, name, line under the name, optional company logo. */
export default function CardHeader({ name, line, portraitSrc, logoSrc, logoAlt, accentFg, compactPhoto = false }: {
  name: string; line: string; portraitSrc: string | null; logoSrc: string | null; logoAlt: string; accentFg: string; compactPhoto?: boolean;
}) {
  const size = compactPhoto ? "size-24" : "size-28";
  return (
    <header
      style={{ color: accentFg, background: "radial-gradient(120% 90% at 85% -10%, rgba(255,255,255,.18), transparent 55%), linear-gradient(165deg, var(--qc-accent), var(--qc-accent-deep))" }}
      className="px-5 pb-10 pt-8 text-center"
    >
      {portraitSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={portraitSrc} width={112} height={112} alt={`Photo of ${name}`} className={`mx-auto mb-4 ${size} rounded-full border-[3px] border-white bg-white object-cover shadow-[0_2px_10px_rgba(0,0,0,.18)]`} />
      ) : logoSrc ? null : (
        <div role="img" aria-label={`${name}, no photo`} className={`mx-auto mb-4 flex ${size} items-center justify-center rounded-full border-[3px] border-white/70 bg-white/15 text-3xl font-semibold`}>{initials(name)}</div>
      )}
      <h1 className="break-words text-[26px] font-semibold leading-tight tracking-[-0.4px]">{name}</h1>
      {line ? <p className="mx-auto mt-1.5 max-w-[34ch] break-words text-[15px] leading-snug opacity-95">{line}</p> : null}
      {logoSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoSrc} alt={logoAlt} className="mx-auto mt-4 max-h-12 w-auto max-w-[60%] rounded-control bg-white p-1.5 shadow-[0_1px_4px_rgba(0,0,0,.15)]" />
      ) : null}
    </header>
  );
}
