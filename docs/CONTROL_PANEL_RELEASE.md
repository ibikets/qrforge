# Qrenuvi control panel and new landing page: release report

Branch `control-panel` (not merged, not in production). Nothing in this report was applied to production Supabase, Paystack or Vercel configuration.

## 1. Results by evidence class

| Class | Item | Result |
|---|---|---|
| **Verified production (read-only, this session)** | Vercel project `qrenuvi`: production alias `qrforge-henna.vercel.app`; deployment protection (SSO, password, trusted IPs) all **disabled** | Confirmed |
| Verified production | `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`, `CRON_SECRET` are scoped to **production and preview**; `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` to production, preview, development | Confirmed (values not read) |
| **Verified isolated engine** (embedded real Postgres, not Supabase) | `tests/db/admin.test.mjs` 119 pass; `tests/db/limits.test.mjs` 34 pass: direct quota bypass, concurrent saves at the limit, cross-user RLS, duplicate and concurrent payment events, plan expiry, entitlement changes, append-only audit, last-Owner protection, offer limits under concurrency, migration + rollback | Pass |
| **Stand-in tests** (local fake Supabase/Paystack; prove app code only) | `roles.mjs`: all 9 route groups x 4 roles + extra grants, anonymous, non-staff, revoked, no-MFA, step-up, cross-site, malformed/oversized, denied calls write nothing; `checkout.mjs`: server-set price, quoted amount sent to Paystack, no `plan` parameter, foreign/paid/expired/other-plan quotes rejected; `admin-screens.mjs`: 20 screens x 5 widths (1440/1024/768/390/320) plus denial/no-MFA/non-staff/bootstrap/anonymous states, axe 0, no overflow, no console errors; earlier suites t2b, t3-t10, a11y3 | Pass (t6 and t10 updated for the new checkout and account menu) |
| User-reported | Earlier: production deploy from `ed1c7d8`; sign-in/nav glitch; migration `20261014000000` unapplied | Not independently re-verified here |
| **Unverified** | Real Paystack test-mode checkout, callback, webhook, renewal; Google sign-in return; password-reset and confirmation emails; live security headers on a preview; Supabase MFA enrolment; keyboard/zoom/screen-reader on real devices; phone/print scanning; cross-user ownership on the real database | Need approval or owner action (section 6) |
| **Fixes written, not deployed** | Everything on this branch until the preview/production deploy | |
| **Migrations prepared, not applied** | `20261014000000` (saved-code limit + atomic payments) and `20261015000000_admin_portal.sql` | See section 3 |

**Not launch-ready.** The saved-code quota hole (direct API inserts, concurrent saves) is only closed by migration `20261014000000`; the compatibility fallback in code is not a security fix. Database issue status: **unresolved until applied and verified**. This testing does not prove the absence of vulnerabilities.

## 2. What was built
- Account menu: round avatar with placeholder icon; opens "My account" and "Sign out" (icons, no underline, keyboard and Escape handling, mobile list variant).
- New landing page (option 3) with content served from the CMS tables when present, otherwise from shipped defaults. No invented metrics, testimonials, support or legal details.
- Checkout page with a server-issued quote, offer code field, renewal consent, regular renewal price disclosed. Paystack `plan` is not used.
- Private management portal under `/admin` (not linked from public pages): Overview, Customers (+detail), Content, Plans, Discounts (+new/detail), Payments (+detail/refunds), Support (+ticket), Statistics, Releases, Staff, Settings, Audit (+event), Security, staff invitation. Roles Owner / Support / Billing / Content Editor enforced in `lib/admin/guard.ts` on every API call and page (never by hidden navigation); MFA (AAL2) required; 15-minute step-up for sensitive actions; reasons required; append-only audit with redaction; last-Owner and self-escalation blocked in both app and database. No SQL console, shell, executable upload or code patching. Features needing absent services show an explicit disabled state naming the dependency (build list/promotion/rollback needs a Vercel token; message sending needs a mail provider; refund execution needs Paystack refund approval; scans and downloads are not measured).
- Rate limits are now per action.

## 3. Migration plan (needs your approval; nothing applied)
Order: **1)** `20261014000000`, **2)** `20261015000000_admin_portal.sql`. Both before enabling the portal; the app works without them (fallbacks) but the quota fix and portal need them.
- Backup: take a Supabase backup/point-in-time marker or `pg_dump` of schema `qrforge` first.
- Expected effects: new triggers/limits on `qr_codes` writes (Free users over 3 saved codes are not deleted, but cannot add more); new `apply_payment`/`apply_quoted_payment` functions; new management tables, RLS on, no customer access; `bootstrap_owner` only usable by the `OWNER_BOOTSTRAP_EMAIL` identity.
- Rollback: `supabase/rollback/*.down.sql` for each, in reverse order. Limits: data written by the portal (audit, campaigns, quotes) is dropped by rollback; code rollback never rolls data back.
- Verify after: re-run the isolated tests' SQL assertions against a Supabase branch first (recommended: `create_branch`, apply there, test, then production).

## 4. Preview security assessment (proposal for approval)
Previews currently carry production `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY` and `CRON_SECRET`, and deployment protection is off, so any preview URL is public and can use them. For this branch the exposure is bounded: the portal reports "migration pending" and `OWNER_BOOTSTRAP_EMAIL` is not set for previews, so nobody can become staff. Customer sign-in on the preview talks to the production Supabase project, as previews did before.
Proposed changes (not made): (1) create a separate Supabase project and Paystack **test** keys; set them for the *Preview* scope only and remove the production-scope secrets from Preview; (2) enable Vercel Authentication ("Standard Protection") for previews; note protection does not cover production aliases and must be re-verified by requesting a preview URL while signed out; (3) keep `OWNER_BOOTSTRAP_EMAIL` production-only until you approve staff setup.

## 5. Connection changes
| Service | Change in this branch | Needed later |
|---|---|---|
| Supabase | none applied | apply two migrations; enable MFA (TOTP); set Auth redirect URLs only if the hostname changes |
| Paystack | none | test-mode key for previews; webhook URL unchanged |
| Vercel | none | env scope changes above; `OWNER_BOOTSTRAP_EMAIL` (production) |
| Google OAuth | none | none unless hostname changes |
| Hostname | unchanged (`qrforge-henna.vercel.app`) | |

## 6. Owner inputs and approvals outstanding
1. Approve applying both migrations (via a Supabase branch first).
2. Approve preview isolation (section 4).
3. Provide `OWNER_BOOTSTRAP_EMAIL`, enable Supabase MFA, then claim Owner at `/admin`.
4. Real Terms, Privacy, refund policy and monitored support contact (placeholders are not published; "Priority support" stays removed).
5. Rotate credentials that were pasted in chat (Supabase service key, Paystack secret, cron secret) and update Vercel env, then redeploy.
6. Owner-run checks: phone/print scanning, screen-reader pass, reset/confirmation emails, Google sign-in, Paystack test-mode checkout and renewal, cross-user ownership SQL on the real DB, live headers.

## 7. Deployment order and rollback
Order: preview isolation -> migrations (branch, then production) -> merge to `main` after your review -> set `OWNER_BOOTSTRAP_EMAIL` -> claim Owner -> invite staff.
Rollback: Vercel "promote previous deployment" (instant), or a normal `git revert` commit on `main`; never force-push. Database: the `down.sql` files above.

## 8. SCREEN-INVENTORY coverage
Landing, landing-offer, pricing, checkout, checkout-code, payment-result, customer-billing -> `/`, `/pricing`, `/checkout`, `/billing`, `/billing/callback`. overview -> `/admin`. customers, customer, customer-edit, customer-suspend, customer-reset -> `/admin/customers[/id]`. content, content-faq, content-history, assets, content-usecases, content-plans, content-footer -> `/admin/content`. plans, plan-edit, entitlement -> `/admin/plans`, customer adjust. discounts, discount-edit, discount-redemptions, discount-review, discount-lifecycle -> `/admin/discounts[/new|/id]`. payments, payment-detail, refund -> `/admin/payments[/reference]`. support, support-ticket -> `/admin/support[/id]`. statistics, releases, release-detail, maintenance, job-status -> `/admin/statistics`, `/admin/releases`. staff, staff-invite, permissions, invite-expired, staff-revoked -> `/admin/staff`, `/staff-invite`, denial states. settings, integrations -> `/admin/settings`. audit, audit-detail -> `/admin/audit[/id]`. staff-login, session-expired, states -> MFA gate, `/login?timeout=1`, shared kit states (loading, empty, error, denied, blocked, confirm, saved, conflict).
Gap to state honestly: `release-detail` and the build list are the explicit "blocked: needs a Vercel token" state, not a working screen.
