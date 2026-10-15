# Regression suites

These run against local stand-ins, never real services. They are evidence of behaviour in code, not of Supabase/Paystack/Vercel behaviour.

| Suite | What it proves | Needs |
|---|---|---|
| `tests/plans-sync.ts` | `plan_limits` in the migration equals `lib/plans.ts` | `npx tsx tests/plans-sync.ts` |
| `tests/db/limits.test.mjs` | migration, rollback, concurrent saves/payments, RLS cross-user on a real Postgres engine (not Supabase) | `npm i --no-save embedded-postgres pg`; must run as a non-root user |
| `tests/e2e/security.mjs` | Origin check, size caps, logo verification, rate limit, payment RPC + fallback, headers | stand-ins + app built with stand-in env (see below) |
| `tests/e2e/a11y.mjs`, `screenshots.mjs` | keyboard, dialog focus, 200% zoom, landmarks, contrast; review screenshots | `npm i --no-save playwright-core`, `CHROMIUM_PATH`, `AXE_PATH` (axe-core) |
| `tests/db/admin.test.mjs`, `tests/db/limits.test.mjs` | management schema: append-only audit, last-Owner protection, quotes/redemptions, atomic and idempotent payments, offer limits under concurrency, role/RLS | as `limits.test.mjs` |
| `tests/e2e/roles.mjs` | every management endpoint x every role: allowed/denied exactly per the matrix, extra grants, anonymous / non-staff / revoked / no-MFA, step-up, cross-site, malformed/oversized bodies, denied calls write nothing | stand-ins + app built with stand-in env and `OWNER_BOOTSTRAP_EMAIL=boot@example.com` |
| `tests/e2e/checkout.mjs` | quote -> initialize: server-set price, quoted amount sent to Paystack, no `plan` param, tampered/foreign/paid/expired quotes rejected, pricing and checkout screens | same |
| `tests/e2e/admin-screens.mjs` | every management screen at 1440/1024/768/390/320 as Owner plus denial, no-MFA, non-staff, bootstrap and anonymous states: status, overflow, axe, console | same + `AXE_PATH`; writes screenshots to `$QRF_SCRATCH/admin-shots` |
| `tests/e2e/session-nav.mjs` | signed-in nav shows the round account menu (My account, Sign out), `/login` redirect, 20-minute idle sign-out | same |
| `tests/e2e/inventory.mjs` | every row of SCREEN-INVENTORY.csv: content, interaction, dialog focus, 1440+390 screenshots, axe. Two phases: `PHASE=plain` and `PHASE=offer` (seed offers, then restart the app only; offers are cached for minutes) | same + `AXE_PATH` |
| `tests/e2e/assets.mjs`, `webhook-history.mjs`, `seed-admin.mjs` | image library safety and delivery-history screens; shared seed data | same |
| `tests/site-origin.ts`, `tests/content-image.ts` | preview-safe callback origin; hero image validation | `npx tsx` |
| `tests/contact.ts` | repeatable contact fields: helpers, validation, vCard encoding, QR round trip (optional `VCARD_OUT` to feed an independent parser) | `npx tsx` |
| `tests/e2e/contact-rows.mjs` | contact form rows in a browser: + / remove, focus, errors, drafts, save/reload/edit, PNG decode, staff view | same + `sharp`, `jsqr` resolvable from the repo |
| `tests/pages-phase5.ts`, `tests/e2e/phase5.mjs` | Phase 5 sections and pages (menu, catalogue, product pages, event, offers, campaign, chooser) | `npx tsx`; stand-ins + built app (restart the app between suites to reset rate limits) |
| `tests/qr/*` | decode matrix over real exports with jsQR and ZXing, distortion tests, dot-radius experiments | `npm i --no-save zxing-wasm jsqr`; see header comments |

Stand-in app: `node tests/stand-ins/server.mjs` (Supabase on :54321, Paystack on :54322), then build and start with
`NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-mock SUPABASE_SERVICE_ROLE_KEY=svc-mock PAYSTACK_SECRET_KEY=sk_test_mock PAYSTACK_API_URL=http://localhost:54322 CRON_SECRET=cron-mock next build && next start -p 3200`.

- `tests/e2e/staff-auth.mjs` (stand-in) and `tests/staff-auth.ts` (local): staff sign-in, separate staff session, method checks, recovery, expiry, logout, bootstrap. Needs the stand-in started with `OWNER_BOOTSTRAP_EMAIL=boot@example.com`; restart the app between runs to reset in-memory rate limits.

- `tests/db/pages.test.mjs` (Engine): hosted-pages migration, quotas, atomic publish, isolation, rollback. Same harness as `limits.test.mjs`.
- `tests/e2e/pages.mjs` (stand-in): hosted card end to end, including staff takedown. `tests/e2e/contact-photo.mjs`: static contact photo, QR stays photo-free, `.vcf` bytes. Both need the stand-in, a build with stand-in env and `OWNER_BOOTSTRAP_EMAIL=boot@example.com`.

- `tests/import-core.ts`, `tests/import-table.ts` (local), `tests/db/import.test.mjs` (Engine), `tests/e2e/import.mjs` (stand-in): spreadsheet import. The e2e test needs `python3` with `openpyxl` to build a sample workbook; restart the app between runs (in-memory rate limits).
- `tests/safe-fetch.mts` (local, `npx tsx`), `tests/import-web.ts` (local), `tests/e2e/import-web.mjs` and `tests/e2e/import-images.mjs` (stand-in + local fixture site; start the app with `IMPORT_FETCH_TEST_ORIGINS=http://127.0.0.1:54400`; need `CHROMIUM_PATH`, `AXE_PATH`): website and picture import.
