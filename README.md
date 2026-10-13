# QRForge

QR code generator (URL, text, email, phone, SMS, WhatsApp, WiFi, vCard) with PNG/SVG/PDF export, logo, colours, and paid plans via Paystack.

## Setup
1. `npm install`
2. Create a Supabase project, run `supabase/schema.sql` in the SQL editor.
3. Copy `.env.example` to `.env.local` and fill in the keys.
4. In Paystack, set the webhook URL to `https://YOUR-DOMAIN/api/paystack/webhook`.
5. `npm run dev`

## Deploy
Push to GitHub, import in Vercel, add the same env vars.

## How billing works
Plans are 30-day passes paid in NGN. `/api/paystack/initialize` starts a Paystack checkout; the webhook and `/billing/callback` both verify the transaction with Paystack (amount + currency checked) and extend `subscriptions.current_period_end`. Edit prices in `lib/plans.ts`.

## Known limits
- Feature gating (types, formats, logo, size) is enforced in the browser, because codes are generated client-side. A determined user could bypass it. For hard enforcement, move generation to a server route.
- No recurring auto-charge yet; users renew manually.
- Dynamic (editable, trackable) QR codes are not included in this MVP.
