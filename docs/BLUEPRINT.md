# QRForge: Product and Technical Blueprint

A QR code generator SaaS (modelled on myqrcode.com/create) with Free, Pro and Business plans, paid in Naira through Paystack. Built for Nigerian users. This document is the source of truth for what exists today, so a designer can create every screen and the result can be built without guessing.

- Live demo: https://qrforge-henna.vercel.app
- Repo: https://github.com/ibikets/qrforge
- Stack: Next.js 16.4 (App Router), React 19, Tailwind CSS v4, Supabase (Postgres + Auth), Paystack, Vercel
- Currency and region: NGN (₦), Lagos / Nigeria first. Dates use the en-NG locale.

---

## 1. What the product does

1. Anyone can build a QR code in the browser (live preview), choosing a type, filling in fields and styling it.
2. Downloads are made on the server only (PNG, SVG, PDF) and are limited by plan. The preview is free for everyone, so the real gate is the download.
3. Signed-in users can save codes to their account, reopen, edit and delete them.
4. Users can upgrade to Pro or Business (30-day passes) through Paystack, optionally with auto-renewal on the card they paid with.
5. Google sign-in and email/password sign-in are both supported.

## 2. Plans and limits (enforced server-side)

| | Free | Pro | Business |
|---|---|---|---|
| Price | ₦0 | ₦3,500 / 30 days | ₦9,500 / 30 days |
| QR types | URL, Text, Email | All 8 | All 8 |
| Download formats | PNG | PNG, SVG, PDF | PNG, SVG, PDF |
| Max size | 512 px | 2048 px | 4096 px |
| Centre logo | No | Yes | Yes |
| Saved codes | 3 | 100 | 1,000 |
| Blurb | For trying things out | For individuals and small teams | For agencies and heavy use |

Plan source of truth: `lib/plans.ts`. Business also lists "Priority support" (copy only, no feature behind it yet).

## 3. QR types and their fields

Source: `lib/qr.ts`. Free types are marked (free).

| Type | Fields |
|---|---|
| Website URL (free) | Website address |
| Plain text (free) | Text (textarea) |
| Email (free) | Email address, Subject, Message (textarea) |
| Phone | Phone number |
| SMS | Phone number, Message (textarea) |
| WhatsApp | WhatsApp number with country code, Pre-filled message (textarea) |
| WiFi | Network name (SSID), Password, Security (WPA / WEP / nopass), Hidden network (checkbox) |
| Contact (vCard) | First name, Last name, Company, Job title, Phone, Email, Website |

Style options: QR colour, background colour, dot style (Square / Rounded / Dots), size slider (256 to plan max, step 64), centre logo upload (PNG/JPEG/WebP, auto-shrunk to 256 px, Pro and up). Error correction is fixed at High so logos stay scannable. Dots style uses full circles, because smaller dots failed scan tests.

## 4. Sitemap and routes

| Route | Auth | Purpose |
|---|---|---|
| `/` | Public | Generator. `?load=<id>` opens a saved code for editing. |
| `/pricing` | Public | Plan comparison, auto-renew consent, upgrade buttons. |
| `/login` | Public | Google button, email/password form, toggle sign in / create account. `?next=` supported. |
| `/codes` | Signed in | Grid of saved codes with count vs plan limit. |
| `/billing` | Signed in | Current plan, renewal state, auto-renew toggle, payment history (last 10). |
| `/billing/callback` | Signed in | Paystack return page. Verifies the payment, shows success or failure. `?reference=`. |
| `/auth/callback` | n/a | OAuth code exchange, redirects to `next`. |
| `/api/generate` | Public | POST. Builds PNG/SVG/PDF if the plan allows. Returns 403 with `upgrade: true` otherwise. |
| `/api/codes` | Signed in | POST create or update a saved code. |
| `/api/codes/[id]` | Signed in | DELETE. |
| `/api/paystack/initialize` | Signed in | POST `{plan, autoRenew}`, returns Paystack checkout URL. |
| `/api/paystack/webhook` | Paystack | Signature-checked, idempotent plan activation. |
| `/api/billing/auto-renew` | Signed in | POST toggle. |
| `/api/cron/renew` | Cron secret | Daily renewal charges. |

Global shell: header (logo "QRForge" left; Pricing link; AuthNav on the right) and a footer. AuthNav shows "Sign in" when signed out, and My codes / Billing / Sign out when signed in.

## 5. Screens and their states (everything a designer must cover)

### 5.1 Generator (`/`)
Two columns on desktop (form left, sticky preview card right), single column on mobile.
- Type picker: pill chips for all 8 types. Locked types on Free show a "Pro" tag. Clicking a locked type shows an inline notice instead of switching.
- Fields card: changes with the type. Controls needed: text input, textarea, select, checkbox.
- Style card: two colour pickers, dot-style select, size slider, logo file input (labelled "(Pro)" on Free).
- Preview card: 280 px live QR, empty state "Fill in the details to see your code".
- Download row: PNG / SVG / PDF buttons. Formats not in the plan look greyed but are still clickable, and the server answers with an upgrade message. Busy state shows "…".
- Save block: name input (max 80), button "Save to my account" or "Update saved code", status message, link to My codes (signed-in only).
- Notice line (amber) with "See plans" link, used for plan-gating and errors.
- Footer line: "Plan: Free."
- Messages used today: "Fill in the details first.", "Sign in to save codes to your account.", "Give your code a name first.", "Saved to your account.", "Updated.", "Adding a logo is on Pro and Business.", "<Type> QR codes are on Pro and Business."

### 5.2 Pricing (`/pricing`)
Heading "Simple pricing", subtitle about paying in Naira by card, bank transfer or USSD. Auto-renew consent box (checked by default, wording is legally important, keep its meaning). Three plan cards (Pro highlighted). Per card: name, blurb, price, features with ticks, action. Free card shows "Your current plan" when relevant. UpgradeButton states: signed out (goes to login), current plan, loading, error, redirecting to Paystack. Loading skeleton exists.

### 5.3 Login (`/login`)
"Sign in" title, Continue with Google (full-colour G logo), divider "or", email and password (min 8), submit, toggle "New here? Create an account". Needs error and "check your email to confirm" states.

### 5.4 My codes (`/codes`)
Title, "N of M saved (Plan plan)". Empty state with link to create the first code. Grid of cards (2 columns mobile, 4 desktop): QR thumbnail 140 px, name (truncated), type label, Open and Delete buttons (browser confirm dialog today; design a proper confirm modal). Loading skeleton exists.

### 5.5 Billing (`/billing`)
Current plan card (name, renewal sentence with date and price, or "Active until … auto-renewal is off", auto-renew toggle, Change plan link, helper note about paying by card). Free state: "You are on the free plan. See plans". Payment history list (plan, date, amount) or "No payments yet.".

### 5.6 Payment result (`/billing/callback`)
Success: "Payment received. Your Pro plan is active for 30 days." Failure: "We couldn't confirm your payment" with guidance. Loading: "Confirming your payment…". Button back to the generator.

### 5.7 Screens that do NOT exist yet (design them, then we build)
- Landing / marketing page (hero, how it works, type gallery, social proof, FAQ). Today `/` is just the tool.
- Forgot password and password reset.
- Email confirmation holding page.
- Account/profile page.
- 404, 500 and "plan expired" pages.
- Terms of Service and Privacy Policy pages (Nigerian audience, NDPR).
- Delete-code confirm modal and toast system.
- Upgrade modal triggered by a gated action (instead of an inline amber line).
- Dynamic QR codes with scan analytics (future).

## 6. Current design: what's there and what's wrong

Honest assessment so the redesign starts from the real problems.

Current implementation: Tailwind utility classes only, near-monochrome (neutral-50 page, white cards, neutral-900 buttons), system font stack (Google Fonts removed because the build sandbox couldn't fetch them), `max-w-6xl` container, rounded-2xl cards, no logo mark, no icons, no illustrations, ticks are text characters, no dark mode, no motion.

Problems the owner called out or that are obvious:
- Looks like a bare form, not a product. No brand, no personality, no hero or landing page.
- The tool page is dense: type chips, fields, style and download controls all compete.
- Gated features are discovered by failing, not by clear design (greyed buttons that still click, tiny "Pro" tags, amber text line).
- Pricing is plain, with no emphasis on value, no comparison table, no FAQ, no trust signals for Nigerian users (Paystack badge, bank transfer and USSD note).
- Saved codes and billing pages are functional only, with no empty-state illustration, no search or sort, no usage meter.
- Browser `confirm()` and inline text are used where modals and toasts belong.
- Mobile layout works but was never designed for thumb reach (download buttons should be near the preview).

## 7. Design requirements and constraints for the redesign

Must keep (behaviour that is built and tested):
- Live preview in the browser, but downloads always go through `/api/generate`.
- All limits come from `lib/plans.ts`. The UI may hint, the server decides.
- Auto-renew consent wording and the "pay by card to enable auto-renew" note.
- The QR must stay scannable. Never reduce contrast below a safe ratio, and warn when colours are too close. Keep a quiet zone around the code.
- Paystack redirect checkout (full-page redirect, not a popup).

Please provide:
1. Brand: name treatment and logo mark, colour palette (with light and dark), type scale and font choice (must be available on Google Fonts or self-hostable), spacing, radii, shadows, icon set.
2. A component library: buttons, inputs, selects, checkbox, switch, slider, colour picker, file drop zone, chips/tabs, cards, modal, toast, skeleton, empty state, tags (Pro/Business), progress/usage meter, nav.
3. Every screen in section 5 (including 5.7) at desktop (1440), tablet (768) and mobile (390), with empty, loading, error and success states.
4. Interaction notes: gating moments, upgrade prompts, save confirmation, delete confirm, download progress.
5. Accessibility: WCAG AA contrast, visible focus rings, keyboard flows, labels for every control.
6. Copywriting: friendly, plain English, Nigerian context (₦, Paystack, WhatsApp-first examples).
7. Export as: a written design spec plus either Figma frames or high-fidelity HTML/Tailwind mockups, so they can be dropped into this Next.js codebase.

Technical constraints for the front end to be built later:
- Next.js 16 App Router, React 19, Tailwind CSS v4 (utility classes, tokens via CSS variables or `@theme`).
- Pages with request-specific data use Suspense boundaries (Cache Components is on).
- No `runtime` exports in route files.
- Keep server components for data pages. Interactive parts are client components.

## 8. Data model (Supabase, schema `qrforge`)

Source: `supabase/schema.sql`.
- `subscriptions` (one row per user): `user_id`, `plan` (pro or business), `current_period_end`, `paystack_reference`, `authorization_code` (server-only), `customer_email` (server-only), `auto_renew`, `failed_attempts`, `last_attempt_at`, `updated_at`.
- `payments`: `reference` (primary key, makes webhooks idempotent), `user_id`, `plan`, `amount_kobo`, `status`, `created_at`.
- `qr_codes`: `id`, `user_id`, `name` (1 to 80 chars), `type`, `fields` (jsonb), `style` (jsonb: fg, bg, dots, size, logo), `created_at`, `updated_at`.
- Row-level security: users read only their own rows. Users cannot read card authorisation data. Only the server (service role) writes subscriptions and payments.

## 9. Key flows

Upgrade: Pricing, choose plan (auto-renew checkbox), POST `/api/paystack/initialize`, redirect to Paystack, pay, return to `/billing/callback?reference=…`, server verifies amount, currency and reference, extends the plan 30 days (from the later of now and the current end), saves the reusable card authorisation if present. The webhook does the same idempotently if the user closes the tab.

Auto-renew: daily cron charges subscriptions due within 24 hours using the saved authorisation. Three failed attempts, or lapsed for more than 7 days, turns auto-renew off. Users can toggle it on Billing.

Auth: Google or email/password through Supabase. `proxy.ts` refreshes the session on each request. OAuth returns through `/auth/callback`.

Download: client posts `{type, fields, style, format, size}`, server validates against the user's plan, renders and returns the file, or a 403 `{error, upgrade: true}`.

## 10. Environment variables (names only, never commit values)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`. See `.env.example`.

## 11. File map

```
app/
  layout.tsx            shell: header, footer, AuthNav
  page.tsx              generator page (loads ?load=<id>)
  pricing/page.tsx      pricing
  login/page.tsx        sign in / sign up
  codes/page.tsx        saved codes
  billing/page.tsx      billing
  billing/callback/     payment result
  auth/callback/        OAuth exchange
  api/                  generate, codes, paystack, billing, cron
components/
  Generator.tsx         the whole tool UI (271 lines)
  PricingGrid.tsx, UpgradeButton.tsx, AutoRenewToggle.tsx
  SavedCard.tsx, AuthNav.tsx, SignOut.tsx
lib/
  plans.ts              plan matrix
  qr.ts                 types, payload builders, form field definitions
  qr-render.ts          SVG renderer and style sanitiser
  paystack.ts           activation, renewals
  supabase.ts, supabase-browser.ts
supabase/schema.sql
proxy.ts, vercel.json, next.config.ts
```

## 12. Known gaps (not designed or built)

Renewal and receipt emails, rate limiting, favicon and brand assets, terms and privacy pages, password reset, dynamic QR codes and scan analytics, custom domain, team accounts.
