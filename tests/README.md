# Regression suites

These run against local stand-ins, never real services. They are evidence of behaviour in code, not of Supabase/Paystack/Vercel behaviour.

| Suite | What it proves | Needs |
|---|---|---|
| `tests/plans-sync.ts` | `plan_limits` in the migration equals `lib/plans.ts` | `npx tsx tests/plans-sync.ts` |
| `tests/db/limits.test.mjs` | migration, rollback, concurrent saves/payments, RLS cross-user on a real Postgres engine (not Supabase) | `npm i --no-save embedded-postgres pg`; must run as a non-root user |
| `tests/e2e/security.mjs` | Origin check, size caps, logo verification, rate limit, payment RPC + fallback, headers | stand-ins + app built with stand-in env (see below) |
| `tests/e2e/a11y.mjs`, `screenshots.mjs` | keyboard, dialog focus, 200% zoom, landmarks, contrast; review screenshots | `npm i --no-save playwright-core`, `CHROMIUM_PATH`, `AXE_PATH` (axe-core) |
| `tests/qr/*` | decode matrix over real exports with jsQR and ZXing, distortion tests, dot-radius experiments | `npm i --no-save zxing-wasm jsqr`; see header comments |

Stand-in app: `node tests/stand-ins/server.mjs` (Supabase on :54321, Paystack on :54322), then build and start with
`NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-mock SUPABASE_SERVICE_ROLE_KEY=svc-mock PAYSTACK_SECRET_KEY=sk_test_mock PAYSTACK_API_URL=http://localhost:54322 CRON_SECRET=cron-mock next build && next start -p 3200`.
