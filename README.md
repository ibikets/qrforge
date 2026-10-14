# QRForge

QR code generator (URL, text, email, phone, SMS, WhatsApp, WiFi, vCard) with PNG/SVG/PDF export, logo, colours, and paid plans via Paystack.

## Setup
1. `npm install`
2. Create a Supabase project, run `supabase/schema.sql` in the SQL editor.
3. Copy `.env.example` to `.env.local` and fill in the keys.
4. In Paystack (Settings > API Keys & Webhooks), set the webhook URL to `https://YOUR-DOMAIN/api/paystack/webhook`. Test and Live modes have separate URLs. Paystack signs events with HMAC-SHA512 of the raw body using your secret key for that mode (`x-paystack-signature`); there is no separate webhook secret to configure.
5. `npm run dev`

## Deploy
Push to GitHub, import in Vercel, add the same env vars.

## How billing works
Plans are 30-day passes paid in NGN. `/api/paystack/initialize` starts a Paystack checkout; the webhook and `/billing/callback` both verify the transaction with Paystack (amount + currency checked) and extend `subscriptions.current_period_end`. Edit prices in `lib/plans.ts`.

## Routes
`/` marketing · `/create` generator (legacy `/?load=id` redirects here) · `/codes` saved codes · `/pricing` · `/billing` · `/account` · `/login`, `/forgot-password`, `/reset-password`, `/confirm-email`.
Supabase Auth must allow `/auth/callback` (including its `next` query) as a redirect URL for sign-in, confirmation and password reset.

## Design system
Working Desk / Forest: tokens and IBM Plex Sans (self-hosted, SIL OFL, `app/fonts/`) in `app/globals.css` and `app/layout.tsx`. Light theme only.

## Enforcement and drafts
- Every download goes through `/api/generate`; plan limits (types, formats, logo, size) and saved-code limits are enforced server-side against the database plan. The browser only renders the preview.
- Auto-renewal charges the saved card via a daily cron (`/api/cron/renew`) and can only be enabled when a reusable card is saved.
- Before sign-in/upgrade redirects the editor can keep a draft in `sessionStorage` (same tab, 30 minutes; sensitive types need consent). Only an opaque id appears in URLs.

## Known limits
- Static QR codes only: editing a saved code changes new downloads, not printed ones. No dynamic codes, analytics, teams or bulk.
- The saved-code limit check is count-then-insert, so two simultaneous saves at the limit can both succeed; a database-level constraint would close this.
- Terms/Privacy pages and a support contact are not published yet (owner must supply content).


## Security, migrations and tests

- `docs/SECURITY_AUDIT.md` lists findings (confirmed, suspected, untested) with fix and verification status. `docs/LAUNCH_READINESS.md` holds the release checklist. `docs/OWNER_TEST_CHECKLIST.md` lists the phone/print scans only a person can do.
- Database changes live in `supabase/migrations/` with matching `supabase/rollback/` scripts. Apply the migration first, then deploy; the app falls back to its previous behaviour when it is not applied yet.
- `supabase/tests/ownership_rollback.sql` is a paste-in cross-user check for the real database that always rolls back.
- `tests/` holds the regression suites (stand-in Supabase/Paystack, Postgres concurrency, QR decoding, accessibility). See `tests/README.md`.
