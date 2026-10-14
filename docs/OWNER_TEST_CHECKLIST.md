# Owner test checklist (things only a person with devices can verify)

Record result, device, and date for each. Items marked REQUIRED block launch.

## A. Phone scans of exported files (REQUIRED)
Download from the live app, show on a laptop screen at normal brightness, scan with the stock camera on one iPhone and one Android phone.
1. Website URL, Square, 512 px, no logo. 2. Website URL, Rounded, 512 px, with a logo.
3. Website URL, Dots, 512 px and 2048 px (Pro), no logo, then with a logo. 4. WiFi (Dots and Square) on a spare network.
5. vCard, Rounded, Pro. 6. WhatsApp, SMS, Phone: confirm the right app opens with the pre-filled content.
7. Forest-on-ivory colours, any style. 8. Inverted (light on dark), only to confirm the warning is right on your phones.

## B. Print tests (REQUIRED before selling print-ready sizes)
Print at 2 cm, 3 cm and 5 cm square (Business 4096 px PNG or SVG/PDF), black on white, on a normal office printer. Scan at arm's length and at 20 cm in daylight and indoor light. Repeat for Dots with a logo. A 2 cm Dots code failing is a reason to add a size note.

## C. Real email flows (REQUIRED)
1. Create an account with a real mailbox; confirm the email link lands signed in on `/create`.
2. Request a password reset; open the link; set a new password; sign in. 3. Open an expired or reused reset link and check the friendly message.
4. In Supabase Auth, URL configuration, confirm the site URL and `https://qrforge-henna.vercel.app/auth/callback` are allowed.

## D. Payments (use test mode first)
1. In Paystack, Settings, Webhooks, confirm recent deliveries to `/api/paystack/webhook` show 200 after your test purchase. 2. Buy Pro with auto-renew off and on; check Billing text. 3. Try paying for Pro while on Business: refused. 4. After going live, one small real purchase by you, then check Billing and the Paystack receipt.

## E. Screen reader and zoom (REQUIRED)
NVDA with Firefox or Chrome on Windows, VoiceOver on iPhone Safari: create a URL code, trigger an error, open the upgrade dialog, download. Browser zoom 200% on a laptop: no clipped text or hidden buttons.

## F. Dashboard settings
Supabase: enable leaked-password protection. Vercel: Deployment Protection on, preview environment variables swapped to test credentials, a WAF rate-limit rule on `/api/generate`, `/api/codes` and `/api/paystack/initialize`.
