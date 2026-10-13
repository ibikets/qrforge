import QRCode from "qrcode";

export type QrStyle = { fg?: string; bg?: string; dots?: string; logo?: string | null };
export type CleanStyle = { fg: string; bg: string; dots: "square" | "rounded" | "dots"; logo: string | null };

const HEX = /^#[0-9a-fA-F]{6}$/;
// png/jpeg/webp only: never SVG, which could reference external resources
const LOGO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
export const MAX_LOGO_CHARS = 150_000;

/** Whitelist every user-controlled value that ends up inside the SVG. */
export function sanitizeStyle(s: QrStyle | undefined): CleanStyle {
  const dots = s?.dots === "rounded" || s?.dots === "dots" ? s.dots : "square";
  return {
    fg: s?.fg && HEX.test(s.fg) ? s.fg : "#111111",
    bg: s?.bg && HEX.test(s.bg) ? s.bg : "#ffffff",
    dots,
    logo: s?.logo && s.logo.length <= MAX_LOGO_CHARS && LOGO.test(s.logo) ? s.logo : null,
  };
}

/** Pure function: runs identically in the browser (preview) and on the server (downloads). */
export function renderSvg(text: string, style: CleanStyle, px: number): string {
  const qr = QRCode.create(text, { errorCorrectionLevel: "H" });
  const n = qr.modules.size;
  const quiet = 4;
  const total = n + quiet * 2;

  // centre box reserved for the logo (kept under ~7% of area; level H tolerates up to ~30%)
  const logoSide = style.logo ? Math.max(5, Math.round(n * 0.22)) : 0;
  const lo = Math.floor((n - logoSide) / 2);
  const hi = lo + logoSide;
  const inLogo = (r: number, c: number) => logoSide > 0 && r >= lo - 1 && r < hi + 1 && c >= lo - 1 && c < hi + 1;
  const inFinder = (r: number, c: number) => (r < 7 && (c < 7 || c >= n - 7)) || (r >= n - 7 && c < 7);

  const rx = style.dots === "square" ? 0 : style.dots === "rounded" ? 0.3 : 0.5;
  const parts: string[] = [];
  parts.push(`<rect width="${total}" height="${total}" fill="${style.bg}"/>`);

  if (style.dots === "square") {
    let d = "";
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        if (qr.modules.get(r, c) && !inFinder(r, c) && !inLogo(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    parts.push(`<path d="${d}" fill="${style.fg}" shape-rendering="crispEdges"/>`);
  } else {
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        if (!qr.modules.get(r, c) || inFinder(r, c) || inLogo(r, c)) continue;
        const x = c + quiet;
        const y = r + quiet;
        parts.push(
          style.dots === "dots"
            ? `<circle cx="${x + 0.5}" cy="${y + 0.5}" r="0.5" fill="${style.fg}"/>`
            : `<rect x="${x}" y="${y}" width="1" height="1" rx="${rx}" fill="${style.fg}"/>`
        );
      }
  }

  // finder patterns (the three big corner squares)
  const frx = style.dots === "square" ? 0 : 1.5;
  for (const [r0, c0] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    const x = c0 + quiet;
    const y = r0 + quiet;
    parts.push(`<rect x="${x}" y="${y}" width="7" height="7" rx="${frx}" fill="${style.fg}"/>`);
    parts.push(`<rect x="${x + 1}" y="${y + 1}" width="5" height="5" rx="${frx * 0.6}" fill="${style.bg}"/>`);
    parts.push(`<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="${frx * 0.4}" fill="${style.fg}"/>`);
  }

  if (style.logo) {
    const x = lo + quiet;
    const pad = 0.35;
    parts.push(`<rect x="${x - pad}" y="${x - pad}" width="${logoSide + pad * 2}" height="${logoSide + pad * 2}" rx="1" fill="${style.bg}"/>`);
    parts.push(
      `<image href="${style.logo}" x="${x}" y="${x}" width="${logoSide}" height="${logoSide}" preserveAspectRatio="xMidYMid meet"/>`
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${total} ${total}">${parts.join("")}</svg>`;
}

export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
