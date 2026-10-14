/**
 * Structured landing-page content. Plain text only: no HTML, no scripts, no raw styles.
 * The published revision is validated again on every read, so a bad row can never break or poison the public page.
 */
export type Landing = {
  hero: { headline: string; support: string; cta: string; freeNote: string };
  uses: { title: string; body: string }[];
  plans: { pro: string; business: string };
  faq: { q: string; a: string }[];
  footer: { links: { label: string; url: string }[] };
};

export const DEFAULT_LANDING: Landing = {
  hero: {
    headline: "Create a code. Make a connection.",
    support: "Turn a link, message or email into a QR code.",
    cta: "Create a QR code",
    freeNote: "Free PNG. No account needed.",
  },
  uses: [
    { title: "Menus and booking pages", body: "Link guests straight to your menu, booking page or website." },
    { title: "Contact and WhatsApp", body: "Start a WhatsApp chat, a call or a text message in one scan." },
    { title: "WiFi for guests", body: "Let visitors join your network without typing a password." },
    { title: "Email and notes", body: "Pre-fill an email or share a short instruction." },
  ],
  plans: { pro: "More code types, SVG and PDF, logos and larger files.", business: "Print-ready sizes and room for a large library of codes." },
  faq: [
    { q: "Can I edit a printed code?", a: "No. These codes are static. Editing saved content changes new downloads; already printed codes keep their original content." },
    { q: "Do codes expire when my plan ends?", a: "No. A static QR image does not expire when a plan ends. It keeps its original content, so any link it points to must stay available." },
    { q: "Do I need an account?", a: "Not for a Free PNG of a website, text or email code. Sign in to save codes." },
  ],
  footer: { links: [] },
};

export const LIMITS = { headline: 90, support: 160, cta: 40, freeNote: 120, usesMax: 8, useTitle: 60, useBody: 200, plan: 160, faqMax: 12, faqQ: 120, faqA: 600, linksMax: 8, linkLabel: 40 };

type R = { ok: true; data: Landing } | { ok: false; error: string; field: string };
const bad = (field: string, error: string): R => ({ ok: false, field, error });
 
const CTRL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;
const MARKUP = /[<>]/;

function text(v: unknown, max: number, min = 1): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t.length < min || t.length > max || CTRL.test(t) || MARKUP.test(t)) return null;
  return t;
}

export function validateLanding(input: unknown): R {
  if (!input || typeof input !== "object") return bad("hero", "Content is missing.");
  const o = input as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const hero = {
    headline: text(o.hero?.headline, LIMITS.headline),
    support: text(o.hero?.support, LIMITS.support),
    cta: text(o.hero?.cta, LIMITS.cta),
    freeNote: text(o.hero?.freeNote, LIMITS.freeNote),
  };
  for (const [k, v] of Object.entries(hero)) if (v === null) return bad(`hero.${k}`, `Check the ${k === "freeNote" ? "free-plan note" : k === "cta" ? "button label" : k}: text only, no angle brackets, within the length limit.`);
  if (!Array.isArray(o.uses) || o.uses.length < 1 || o.uses.length > LIMITS.usesMax) return bad("uses", `Add 1 to ${LIMITS.usesMax} popular uses.`);
  const uses: Landing["uses"] = [];
  for (const [i, u] of o.uses.entries()) {
    const title = text(u?.title, LIMITS.useTitle);
    const body = text(u?.body, LIMITS.useBody);
    if (!title) return bad(`uses.${i}.title`, `Popular use ${i + 1}: add a short title.`);
    if (!body) return bad(`uses.${i}.body`, `Popular use ${i + 1}: add a short description.`);
    uses.push({ title, body });
  }
  const pro = text(o.plans?.pro, LIMITS.plan);
  const business = text(o.plans?.business, LIMITS.plan);
  if (!pro) return bad("plans.pro", "Add a short Pro teaser. Prices come from the plan, not from this text.");
  if (!business) return bad("plans.business", "Add a short Business teaser. Prices come from the plan, not from this text.");
  if (/[₦$€£]|\bNGN\b|\d{3,}/.test(pro + business)) return bad("plans.pro", "Plan teasers cannot contain prices. Prices come from the plan version.");
  if (!Array.isArray(o.faq) || o.faq.length > LIMITS.faqMax) return bad("faq", `Keep to ${LIMITS.faqMax} questions or fewer.`);
  const faq: Landing["faq"] = [];
  for (const [i, f] of o.faq.entries()) {
    const q = text(f?.q, LIMITS.faqQ);
    const a = text(f?.a, LIMITS.faqA);
    if (!q) return bad(`faq.${i}.q`, `Question ${i + 1}: add the question.`);
    if (!a) return bad(`faq.${i}.a`, `Question ${i + 1}: add the answer.`);
    faq.push({ q, a });
  }
  const links: Landing["footer"]["links"] = [];
  const rawLinks = o.footer?.links ?? [];
  if (!Array.isArray(rawLinks) || rawLinks.length > LIMITS.linksMax) return bad("footer", `Keep to ${LIMITS.linksMax} footer links or fewer.`);
  for (const [i, l] of rawLinks.entries()) {
    const label = text(l?.label, LIMITS.linkLabel);
    if (!label) return bad(`footer.links.${i}.label`, `Footer link ${i + 1}: add a label.`);
    let url: string;
    try {
      const u = new URL(String(l?.url ?? ""));
      if (u.protocol !== "https:" || u.username || u.password) throw new Error();
      url = u.toString();
    } catch {
      return bad(`footer.links.${i}.url`, `Footer link ${i + 1}: use a full https:// address.`);
    }
    links.push({ label, url });
  }
  return { ok: true, data: { hero: hero as Landing["hero"], uses, plans: { pro, business }, faq, footer: { links } } };
}
