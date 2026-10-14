import Link from "next/link";

type Variant = "horizontal" | "wordmark" | "symbol";
type Tone = "forest" | "ink" | "white" | "ivory";

// Approved Qrenuvi artwork (public/brand). Use forest/ink on light surfaces, white/ivory on dark ones.
// The SVGs carry their own clear space, so size by height only and never stretch.
const HEIGHT: Record<Variant, string> = {
  horizontal: "h-10",
  wordmark: "h-9",
  symbol: "h-9",
};

export function LogoImage({
  variant = "horizontal",
  tone = "forest",
  className = "",
  decorative = false,
}: {
  variant?: Variant;
  tone?: Tone;
  className?: string;
  decorative?: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/brand/qrenuvi-${variant}-${tone}.svg`}
      alt={decorative ? "" : "Qrenuvi"}
      className={`block w-auto ${HEIGHT[variant]} ${className}`}
      draggable={false}
    />
  );
}

/** Logo that links home. The image's alt text is the link's accessible name. */
export default function Logo({
  variant = "horizontal",
  tone = "forest",
  className = "",
  href = "/",
  label,
}: {
  variant?: Variant;
  tone?: Tone;
  className?: string;
  href?: string;
  label?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={`-ml-2 inline-flex items-center rounded-control no-underline ${className}`}
    >
      <LogoImage variant={variant} tone={tone} decorative={Boolean(label)} />
    </Link>
  );
}
export { Logo };
