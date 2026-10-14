import Link from "next/link";
import { PLANS, formatNaira } from "@/lib/plans";
import { QR_TYPES } from "@/lib/qr";
import { renderSvg, sanitizeStyle, svgDataUrl } from "@/lib/qr-render";
import { LinkButton } from "@/components/ui/Button";

const sample = svgDataUrl(renderSvg("https://example.com", sanitizeStyle(undefined), 320));

const TYPE_NOTE: Record<string, string> = {
  url: "A menu, booking page or website.",
  text: "A short note or instruction.",
  email: "A ready-to-send message.",
  phone: "Tap to call.",
  sms: "A text message, ready to send.",
  whatsapp: "Start a WhatsApp chat.",
  wifi: "Connect guests to WiFi.",
  vcard: "Save your contact details.",
};

export default function Home() {
  return (
    <div className="mx-auto max-w-[1280px] px-5 py-8 sm:px-10 sm:py-10">
      <section className="grid items-center gap-8 pb-12 min-[900px]:grid-cols-[1fr_360px] min-[900px]:gap-16 min-[900px]:pt-6">
        <div>
          <p className="mb-3 text-sm font-medium uppercase tracking-wider text-brand">Create a code. Make a connection.</p>
          <h1 className="mb-3 max-w-[650px] text-[28px] font-semibold leading-tight tracking-[-0.9px] sm:text-[48px] sm:leading-[1.15]">
            QR codes for everyday business.
          </h1>
          <p className="mb-8 max-w-[600px] text-lg text-muted">Share a link, start a WhatsApp chat, or connect guests to WiFi.</p>
          <LinkButton href="/create">Create a QR code</LinkButton>
          <p className="mt-3 text-[13px] text-muted">Free PNG for website, text and email. No account needed.</p>
        </div>
        <aside className="rounded-panel bg-soft p-6">
          <h2 className="text-lg font-medium">One link. Ready to share.</h2>
          <div className="my-5 bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sample} alt="Example QR code for example.com" width={320} height={320} className="block w-full" />
          </div>
          <p className="text-[13px] text-muted">A static QR for your menu, booking page or website.</p>
        </aside>
      </section>

      <hr className="my-10 border-0 border-t border-divider" />
      <h2 className="mb-5 text-2xl font-medium">Create. Check. Share.</h2>
      <ol className="mb-12 grid list-none gap-8 p-0 min-[800px]:grid-cols-3">
        {[
          ["1. Choose what to share", "Pick a link, message or another supported QR type."],
          ["2. Make it yours", "Add your details. Keep the default style or choose your colours."],
          ["3. Download and test", "Get your file and scan it before sharing or printing."],
        ].map(([h, p]) => (
          <li key={h}>
            <h3 className="mb-2 text-lg font-medium">{h}</h3>
            <p className="text-muted">{p}</p>
          </li>
        ))}
      </ol>

      <h2 className="mb-5 text-2xl font-medium">Built for everyday business</h2>
      <ul className="mb-12 grid list-none grid-cols-2 gap-x-5 p-0 min-[800px]:grid-cols-4">
        {QR_TYPES.map((t) => (
          <li key={t.id} className="border-b border-divider py-4">
            <h3 className="mb-1 text-lg font-medium">{t.label}</h3>
            <p className="mb-2 text-sm text-muted">{TYPE_NOTE[t.id]}</p>
            <span className="inline-block rounded bg-soft px-2 py-1 text-xs font-medium text-brand">{t.basic ? "Free" : "Pro"}</span>
          </li>
        ))}
      </ul>

      <div className="mb-12 rounded-control bg-soft p-4">
        <strong className="mb-1 block font-medium text-brand">Pay in Naira</strong>
        <p className="text-sm text-muted">
          Pro {formatNaira(PLANS.pro.priceNgn)} / 30 days. Business {formatNaira(PLANS.business.priceNgn)} / 30 days.{" "}
          <Link href="/pricing" className="text-brand underline">Compare plans</Link>
        </p>
      </div>

      <div className="max-w-[800px]">
        <h2 className="mb-3 text-2xl font-medium">Before you print</h2>
        {[
          ["Can I edit a printed code?", "These codes are static. Editing saved content changes new downloads; already printed codes keep their original content."],
          ["Do codes expire when my plan ends?", "Static QR images do not expire because your plan ends. They keep their original content; destination links must stay available."],
          ["Do I need an account?", "Not for a Free PNG of a website, text or email. Sign in to save codes."],
        ].map(([q, a], i) => (
          <details key={q} open={i === 0} className="border-b border-divider py-4">
            <summary className="cursor-pointer font-medium">{q}</summary>
            <p className="mt-2 text-muted">{a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
