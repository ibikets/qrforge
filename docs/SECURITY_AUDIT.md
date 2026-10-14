# Qrenuvi security audit (14 October 2026)

Scope: code at `2119e54` (the deployed commit) plus this branch's changes, the Supabase project's policies and grants (read-only), Vercel project settings (read-only), dependencies, and Paystack's public webhook documentation. This reduces risk; it does not prove the absence of vulnerabilities.

Evidence labels: **STAND-IN** = local Supabase/Paystack stand-ins or a local Postgres engine. **REAL-READ** = read-only inspection of the real Supabase/Vercel project. **DOCS** = vendor documentation. **CODE** = reading the source. Nothing here made a real charge, wrote to the real database, or probed production.

## Confirmed findings

| # | Sev | Where | Evidence | Impact | Fix | Status |
|---|---|---|---|---|---|---|
| F1 | High | `qrforge.qr_codes` grants and policies; Supabase data API | REAL-READ: `authenticated` holds INSERT and UPDATE; policies only compare `user_id`. STAND-IN (Postgres): 6 of 6 direct inserts accepted on Free (limit 3), a 2 MB `fields` blob accepted, paid types stored. | A signed-in Free user, using their own token against the data API, skips the saved-code limit and stores unbounded data. Exports stay plan-gated by `/api/generate`, so no paid file is obtained. | Migration `20261014000000`: per-user locked entitlement trigger, size and type constraints, column-limited UPDATE. | Fixed in branch. **Migration not applied to production.** STAND-IN 34/34 pass. Real-database behaviour test blocked (see below). |
| F2 | Medium | `POST /api/codes` count-then-insert | STAND-IN: 12 simultaneous saves stored 12 codes on a limit of 3. | Limit overrun by concurrent requests. | Same trigger (advisory lock per user, fresh count under READ COMMITTED). Route maps `QF001` to the friendly limit response. | Fixed in branch (needs migration). After migration: 20 concurrent inserts stored exactly 3; 120 on Pro stored exactly 100. |
| F3 | Medium | `activateFromReference` | CODE: payment row is claimed, then the subscription is upserted in a second call. A crash between them leaves a payment with no entitlement, and later calls answer "confirmed" from the duplicate key. Two different references for one user read-modify-write the period end. | A paying customer can be left without a plan; simultaneous payments can lose purchased days. | `qrforge.apply_payment` applies both in one transaction, serialised per user; never downgrades an active Business plan on a Pro payment. App falls back to the old path until the migration exists. | Fixed in branch (needs migration). STAND-IN: 12 concurrent payments gave exactly 360 days; 10 concurrent duplicates changed nothing. The crash window and lost update were found by reading, not reproduced on the old path. |
| F4 | Low | webhook/callback with metadata naming an unknown or malformed user | CODE: the foreign-key error was treated as transient, so the webhook answered 503 and Paystack retried. | Endless retries for an unusable event. | UUID check, FK error treated as permanent. | Fixed. STAND-IN tests pass. |
| F5 | Low | `POST /api/codes`, cron route | CODE: raw database error text and exception messages returned to the client. | Internal detail disclosure. | Generic messages; details logged server-side. | Fixed, tested. |
| F6 | Medium (defence in depth) | no security headers | CODE: `next.config.ts` set none. The Billing and checkout buttons could be framed. | Clickjacking; weaker XSS containment. | CSP (`frame-ancestors 'none'`, `object-src 'none'`, `base-uri`, `form-action`, `connect-src` limited to self and Supabase), X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS, `no-store` on `/api/*`, X-Powered-By removed. | Fixed in branch, verified on a stand-in build. **Live site has none until deployed.** `script-src` keeps `'unsafe-inline'` because pages are prerendered (no per-request nonce). |
| F7 | Low | state-changing routes | CODE: relied on SameSite=Lax alone. | Cross-site request if a cookie were ever sent cross-site. | Origin check on save, delete, auto-renew and checkout routes. | Fixed, tested. |
| F8 | Low | `/api/generate`, `/api/codes`, `/api/paystack/initialize` | CODE: no body cap or rate limit. | Cheap requests can burn CPU; large bodies parsed. | 400 KB body cap; per-instance rate limits (40/min generate, 30/min save, 10/min checkout). | Fixed as best effort. Serverless instances do not share counters, so a Vercel WAF rate-limit rule is still needed. |
| F9 | Low | logo upload | STAND-IN: label-only check. A mislabelled SVG rendered blank; a 4000x4000 PNG under the byte cap added about 70 MB resident memory. File-reference and nested-SVG attempts did not load. | Memory pressure, confusing results. | `verifyLogo`: real format must match the label, 2000 px side limit. | Fixed, tested. |

## Suspected risks (not code-fixable here, or not proven)

| # | Sev | Risk | Evidence | Recommendation |
|---|---|---|---|---|
| S1 | Medium | Preview deployments carry production secrets and are public | REAL-READ: `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`, `CRON_SECRET` target production and preview; deployment protection is off. | Give preview its own test Supabase project and Paystack test key; turn on Deployment Protection. Needs owner action. |
| S2 | Medium | Leaked-password protection disabled | REAL-READ: Supabase security advisor. | Enable in Supabase Auth settings (plan permitting). |
| S3 | Low | Refunds and disputes do not change entitlement | CODE: only `charge.success` is handled. | Decide a refund policy first; then handle `refund.processed` and dispute events. |
| S4 | Info | WiFi passwords and contact details are stored as plain JSON in saved codes | CODE. Protected by row-level security. | State this in the Privacy notice. Consider encryption at rest only if the policy requires. |
| S5 | Info | Supabase session cookies are readable by page scripts (library design) | CODE. | Keep no XSS sinks (none found), keep CSP. |
| S6 | Info | No self-serve account deletion or data export | CODE. | Owner/legal decision under the NDPA. |

## Controls checked and found sound

- Row-level security is on for all three tables; own-row policies; `authorization_code` and `customer_email` are not selectable by users (REAL-READ catalog; STAND-IN behaviour tests: all cross-user and billing-column denial checks pass).
- Paystack webhook: HMAC-SHA512 over the raw body with the secret key, timing-safe compare; no separate webhook secret exists (DOCS). Amount, currency and plan map are re-checked against Paystack's own verify call; `payments.reference` primary key makes replays idempotent.
- Redirect validation (`safeNext`) rejects `//`, backslashes and control characters. Password-reset request gives the same answer whether or not the account exists.
- No `dangerouslySetInnerHTML`, `innerHTML`, `eval`. Logo data URLs are PNG/JPEG/WebP only. Download filenames are sanitised.
- Secret values: not in the client bundle (stand-in build scanned), not in git history (pattern scan for Paystack, Google, Supabase and JWT shapes: only the word `service_role` in `schema.sql`), and the three secret variables are stored as Vercel "sensitive".
- Dependencies: `npm audit --omit=dev` found 0 vulnerabilities. `npm audit` also reports 5 high findings, all in the ESLint toolchain (`eslint-config-next`, `braces`, `micromatch`, `fast-glob`); they are dev-only and not shipped.

## Untested

- Real Supabase email delivery for reset and confirmation, and the Auth redirect allow-list.
- A real renewal charge by the cron job, and the live webhook (the Vercel runtime log window searched was empty; check Paystack's webhook log).
- Cross-user behaviour on the real database (the SQL prompt was cancelled twice; `supabase/tests/ownership_rollback.sql` is ready to paste and always rolls back).
- Response headers on the live site (the sandbox cannot reach it).
- Behaviour under load; a global rate limit.
