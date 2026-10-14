# Qrenuvi control panel and new landing page: approval package

Branch `control-panel` (not merged; `main` unchanged; not in production). Nothing here was applied to production Supabase, Paystack or Vercel configuration. Report date: 14 October 2026 (Lagos).

**Status: not launch-ready.** The saved-code quota fix (migration `20261014000000`) and the management schema (`20261015000000`) are unapplied, the previews still carry production secrets, and several checks need real services (section 3 and section 9). Testing here does not prove the absence of vulnerabilities.

## Evidence classes used throughout
| Class | Meaning |
|---|---|
| **Service-verified** | Read from the real Vercel/Supabase account this session (read-only) |
| **Engine-verified** | Embedded real PostgreSQL 17 (not Supabase): proves SQL logic, triggers, RLS written in the migrations; does **not** prove Supabase Auth, PostgREST grants or the `authenticated`/`service_role` JWT path |
| **Stand-in** | Local fake Supabase and Paystack servers (`tests/stand-ins`): prove app code only |
| **User-reported** | Things you told me; not re-verified |
| **Unverified** | Needs a real service or a person with a device |

## 1. Screen-inventory coverage (`SCREEN-INVENTORY.csv`, 50 rows)
**Route count versus layout/state count.** The 50 inventory rows are layouts and states on **25 distinct routes** (/, /pricing, /checkout, /billing, /billing/callback, /login, /staff-invite and 18 management routes). A route that renders is not counted as complete: each row below was driven by `tests/e2e/inventory.mjs` for its real content, its key interaction (dialogs: Cancel focused first, Escape closes, focus returns to the opener) and its states, at 1440 px and 390 px, with axe (WCAG 2.2 AA tags), horizontal-overflow and console-error checks. Screenshots: `inventory/<id>_<width>.png` in the test scratch folder.

Final run (stand-ins, built app): **all checks pass** across 55 test screens (the 50 rows plus 5 role variants: Support overview, Billing customer scope, Billing statistics, Support audit scope, plan publish). Landing offer needed a wait for the cache (see its row).

Status meanings: **Complete** = built and the listed interactions pass on stand-ins/engine; **Partial** = built, but a named part is blocked or checked only against a stand-in; **Blocked** = depends on a service not connected, shown as a disabled state naming the dependency. Complete: 41, Partial: 8, Blocked: 1. Complete does not mean verified against real services (section 7).

| Screen id | Layout | Route | Component / state exercised | Desktop 1440 + mobile 390 checks | Status | Notes / deviations |
|---|---|---|---|---|---|---|
| landing | Landing · standard | `/` | app/page.tsx, QR workbench, preview, plan teasers, FAQ | 16/16 pass | Complete |  |
| landing-offer | Landing · public offer | `/ (offer phase)` | public offer notice + teaser prices from cached catalog | all pass on re-run (first full run hit the cached snapshot) | Complete | Offers are cached for minutes; first render after a deploy can be the build snapshot (measured 0–29 s in test) |
| pricing | Pricing · offer comparison | `/pricing` | PricingGrid, comparison table | 16/16 pass | Complete | Signed-out visitors no longer see 'Your current plan' (defect found by this test, fixed) |
| checkout | Checkout · discount summary | `/checkout?plan=` | CheckoutPanel (server quote, renewal consent) | 16/16 pass | Complete | Stand-in tests; no live Paystack call |
| checkout-code | Checkout · onboarding code | `/checkout?plan=` | offer-code field: apply, neutral failure, remove | 14/14 pass | Complete | Neutral wording does not reveal whether a code exists |
| payment-result | Payment · confirmed/pending/failed | `/billing/callback` | confirmed / pending / failed states | 16/16 pass | Complete | Stand-in Paystack; real-service check listed in section 7 |
| customer-billing | Customer billing · renewal price | `/billing` | plan, expiry, renewal, history, cancellation copy | 14/14 pass | Complete |  |
| overview | Overview · owner worklist | `/admin` | counters, worklist, recent activity | 10/10 pass | Complete | Also checked: Support sees no revenue |
| customers | Customers · list | `/admin/customers` | list, filters, filter-empty, error | 14/14 pass | Complete |  |
| customer | Customer · details | `/admin/customers/[id]` | profile, plan, payments, support history, notes | 12/12 pass | Complete | Billing scope checked (no notes/support history) |
| customer-edit | Customer · edit profile | `/admin/customers/[id]` | profile form + reason | 8/8 pass | Partial | Save/refusal path exercised against the stand-in only; assertion accepts saved or clear error |
| customer-suspend | Customer · suspension review | `/admin/customers/[id]` | Suspend dialog | 16/16 pass | Complete | Cancel-first focus, Escape, focus restore |
| customer-reset | Customer · password help | `/admin/customers/[id]` | Password-reset dialog | 16/16 pass | Complete | Dialog verified; actual email delivery unverified (section 7) |
| content | Content · landing editor | `/admin/content` | editor tabs, preview, save, dirty, conflict | 16/16 pass | Complete |  |
| content-faq | Content · FAQ editor | `/admin/content (Questions tab)` | question editor, tab arrow keys | 10/10 pass | Complete |  |
| content-history | Content · revision history | `/admin/content (History)` | revisions, publish is separate Owner action | 10/10 pass | Complete |  |
| assets | Content · asset library | `/admin/content (Images)` | ImageLibrary upload/archive | 12/12 pass | Complete | Image safety covered by tests/e2e/assets.mjs; storage is a stand-in |
| plans | Plans · catalogue | `/admin/plans` | price versions, limits table | 8/8 pass | Complete |  |
| plan-edit | Plans · versioned edit | `/admin/plans` | new version form; Billing cannot publish; Publish dialog | 10/10 pass | Complete |  |
| discounts | Discounts · campaigns | `/admin/discounts` | offer list | 10/10 pass | Complete |  |
| discount-edit | Discounts · offer editor | `/admin/discounts/new` | full form with help text | 12/12 pass | Complete |  |
| discount-redemptions | Discounts · redemptions | `/admin/discounts/[id]` | redemption table, held/used | 10/10 pass | Complete |  |
| discount-review | Discounts · publish review | `/admin/discounts/[id]` | publish review + Publish dialog | 20/20 pass | Complete |  |
| payments | Payments · transaction list | `/admin/payments` | list, filters, breakdown | 10/10 pass | Complete |  |
| payment-detail | Payments · reconciliation | `/admin/payments/[reference]` | breakdown, reconcile, delivery history | 10/10 pass | Complete | Provider check needs a live key (unverified) |
| refund | Payments · refund review | `/admin/payments/[reference]` | refund requests, decline dialog | 20/20 pass | Partial | Request/decide done; sending money back is blocked (needs Owner authorisation of a Paystack refund) |
| entitlement | Plans · manual adjustment | `/admin/customers/[id]` | plan-time adjustment | 8/8 pass | Complete |  |
| support | Support · queue | `/admin/support` | queue, filters | 10/10 pass | Partial | Replies cannot be sent: no verified sending address/provider |
| support-ticket | Support · ticket detail | `/admin/support/[id]` | thread, notes, draft, assignment | 12/12 pass | Partial | Send reply blocked, named dependency shown |
| statistics | Statistics · operational metrics | `/admin/statistics` | range, basis, freshness, tables | 10/10 pass | Partial | Scans/downloads are not instrumented (shown as not measured) |
| releases | Releases · approved builds | `/admin/releases` | deployment identity | 10/10 pass | Partial | Build list / promote / rollback blocked: needs Vercel token + approved build list |
| release-detail | Releases · deployment review | `/admin/releases` | build review / rollback | 8/8 pass | Blocked | Same dependency; page states it, no fake success |
| maintenance | Releases · approved maintenance | `/admin/releases` | allowlisted job with preview of effect | 10/10 pass | Complete | No SQL/shell/upload controls (checked) |
| staff | Staff · members | `/admin/staff` | members, invitations, self-change refusal | 10/10 pass | Complete |  |
| staff-invite | Staff · invitation | `/admin/staff` | invite form, End access dialog | 18/18 pass | Complete | Invite email is a link the Owner shares; no email sent |
| permissions | Staff · permission matrix | `/admin/staff` | permission matrix | 8/8 pass | Complete |  |
| settings | Settings · product & support | `/admin/settings` | legal/support details start empty | 8/8 pass | Complete | Owner must supply real legal/support details |
| integrations | Settings · service connections | `/admin/settings` | service connections | 10/10 pass | Partial | Provider mapping shown as 'Not verified' until checked against real services |
| audit | Audit · activity | `/admin/audit` | append-only list | 8/8 pass | Complete |  |
| audit-detail | Audit · event detail | `/admin/audit/[id]` | before/after, redaction note | 10/10 pass | Complete | Redaction is app-level before storage |
| staff-login | Staff · sign-in & MFA | `/admin (no second step)` | MFA gate | 10/10 pass | Partial | Gate verified; enrolment itself needs real Supabase MFA (stand-in has no MFA) |
| session-expired | Staff · session expired | `/admin/settings, /login?timeout=1` | step-up (reauth_required), idle notice | 10/10 pass | Complete |  |
| states | States · shared feedback | `shared states` | denied, filter-empty, error without invented numbers | 12/12 pass | Complete |  |
| content-usecases | Content · use-case editor | `/admin/content (Popular uses)` | fields, add/remove | 8/8 pass | Complete |  |
| content-plans | Content · plan teaser editor | `/admin/content (Plan teasers)` | price-in-text refused | 8/8 pass | Complete |  |
| content-footer | Content · footer & links | `/admin/content (Footer links)` | https-only links | 8/8 pass | Complete |  |
| discount-lifecycle | Discounts · pause & archive | `/admin/discounts/[id]` | Pause / Archive dialogs, frozen live offer | 28/28 pass | Complete |  |
| job-status | Releases · job status | `/admin/releases` | last runs, completion semantics | 8/8 pass | Complete |  |
| invite-expired | Staff · expired invitation | `/staff-invite` | invalid/expired invitation | 8/8 pass | Complete |  |
| staff-revoked | Staff · access revoked | `/admin` | access-ended state | 10/10 pass | Complete |  |


**Account menu.** Signed-in header shows a round avatar; the menu contains **My account, Billing and Sign out** (checked in `session-nav.mjs`): opening focuses the first item, ArrowDown/Home/End move focus, Escape closes and returns focus to the avatar, items are not underlined.

**Defects this exercise found and fixed:** signed-out visitors saw "Your current plan" under Free on /pricing; checkout and billing copy contradictions; "vundefined" in payment campaign text; statistics page crash on a null result; releases table overflow at 390/320; payment-detail now shows callback/webhook history instead of a blocked placeholder.

## 2. Preview protection (service-verified settings; unauthenticated reachability unverified)
Project `qrenuvi` settings read through the Vercel API today: Vercel Authentication (`ssoProtection`) **disabled**; Password Protection **disabled**; Trusted IPs **disabled**. No other protection mechanism is configured.
- **Which URLs are protected: none, by configuration.** That covers the generated deployment URLs (`qrenuvi-<hash>-bitzpark-s-projects.vercel.app`), the branch alias for `control-panel`, `qrenuvi-bitzpark-s-projects.vercel.app`, and the production alias `qrforge-henna.vercel.app`.
- **Can an unauthenticated visitor reach each hostname?** By settings, yes. I could not prove it with an unauthenticated request: the sandbox cannot reach `*.vercel.app` (egress is blocked and I did not bypass it), and my earlier access through the Vercel tool is authenticated and **is not evidence**. Correction: an earlier message of mine said the preview sat behind your Vercel login; that was wrong.
- **Shareable link.** The Vercel tool minted a temporary shareable-link bypass token on the branch alias while fetching. With protection off the token has no effect, but it should be revoked in Project > Settings > Deployment Protection when protection is enabled.
- **Plan limits (unconfirmed, check in the dashboard):** Vercel Authentication is offered on every plan; Password Protection and Trusted IPs are paid add-ons/Enterprise. I did not verify your plan.
- **Owner check, 30 seconds:** open the branch-alias URL in a private window. If you see the Qrenuvi landing page, it is public. After the change in section 3, the same window should show a Vercel sign-in page; repeat for one generated deployment URL.

## 3. Preview isolation
### 3a. Environment-variable inventory (names and scopes only; values not read)
| Variable | Production | Preview | Development | Problem |
|---|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` (sensitive) | yes | **yes (same key)** | no | Preview can read/write **production** data |
| `PAYSTACK_SECRET_KEY` (sensitive) | yes | **yes (same key)** | no | Preview can create charges with the production key; I cannot see whether it is a test or live key (ask: which is it?) |
| `CRON_SECRET` (sensitive) | yes | **yes (same value)** | no | Anyone holding it could trigger renewals from a preview URL |
| `NEXT_PUBLIC_SITE_URL` | yes | **yes (production URL)** | no | Preview checkouts would return customers to production (**fixed in code**, below) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | **yes (production project)** | yes | Preview sign-ups land in the production auth tables |
| `OWNER_BOOTSTRAP_EMAIL` | not set | not set | not set | Good: nobody can claim Owner today |

No branch-specific overrides exist. There are no Supabase branches. Your Supabase org "BPL" is on the **Free** plan with two active projects (qrforge and Quanvo), so a third project or a database branch is not possible without a plan change or pausing another project (I will not touch Quanvo).

### 3b. Changes already made in code (this branch; tests pass)
- `lib/site.ts`: on a Vercel preview, callback/reset/invitation links use the address the request arrived on, never `NEXT_PUBLIC_SITE_URL`; production behaviour unchanged. Test: `tests/site-origin.ts`.
- `/api/cron/renew` returns 403 on preview deployments unless `ALLOW_PREVIEW_CRON=true`. (Vercel schedules crons only for production; this stops manual runs against shared data.)
- Layout `metadataBase` uses the branch URL on previews.

### 3c. Exact proposed configuration changes (NOT applied; need your approval)
1. **Supabase test environment.** Choose one: (A) upgrade org BPL to Pro and create a database branch of `qrforge` (cost is shown by Supabase before creation; I will quote it first); (B) create a new free project in a different organisation you control. Either way: apply both migrations there first, enable email + Google + TOTP MFA, add the Auth redirect URL for the preview hostname pattern.
2. **Preview-scope env vars** (Production values untouched): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` -> the test project's values; `PAYSTACK_SECRET_KEY` -> a Paystack **test** secret key (`sk_test_...`); `CRON_SECRET` -> a new random value different from production; remove `NEXT_PUBLIC_SITE_URL` from the Preview scope. Secrets you supply go straight into Vercel env vars and are not kept anywhere else.
3. **Vercel deployment protection:** enable Vercel Authentication (Standard Protection) for preview deployments; keep the production alias public; revoke the temporary shareable-link token.
4. Keep `OWNER_BOOTSTRAP_EMAIL` **production-only** and set only after you approve section 6.
5. Paystack test mode: the dashboard webhook URL need not change; previews do not receive webhooks, so preview payments confirm through the signed-in callback only (this is the path to test).

### 3d. Verification after approval (checklist I will run and report)
Preview env shows only test values; a preview signup does not appear in the production user list; a preview checkout uses a `sk_test` transaction and redirects back to the preview host; `curl` of `/api/cron/renew` on the preview returns 403; an unauthenticated request to the preview URL returns the Vercel sign-in page; production deployment and data unchanged.

## 4. Isolated Supabase testing of both migrations
**Status: not run against real Supabase.** Dependency: a test environment (section 3c, step 1). I did not substitute local PostgreSQL for it. Until then, the table below shows what each test area proves and what is still unproven.

Test files and what they covered: Engine = embedded PostgreSQL 17 executing the real migration files (`admin.test.mjs`: 140 checks pass; `limits.test.mjs`: 39 pass); Stand-in = built app against fake Supabase/Paystack.

| Area requested | Engine | Stand-in (app code) | Needs real Supabase |
|---|---|---|---|
| Direct API quota bypass; concurrent saves at limit | pass | n/a | PostgREST insert with a real user JWT |
| Cross-user read/write | pass (RLS in SQL) | n/a | real JWTs and grants |
| Staff permissions via direct endpoints | n/a | pass (every endpoint x every role) | database-level role checks with Auth |
| Anonymous / non-staff / revoked / no-MFA / expired-session callers | revoked and non-staff in SQL | pass | real AAL2 claims from Supabase MFA |
| Last-Owner and self-escalation | pass (trigger) | pass | none beyond the above |
| Append-only audit and redaction | append-only pass | redaction pass (app-level, before storage) | grants on `audit_events` |
| Campaign eligibility, schedule boundaries (Lagos), redemption limits, last-slot concurrency | pass | n/a | none |
| Duplicate/concurrent payment events | pass | pass | real webhook signature path |
| Quoted amount verification; normal renewal pricing | pass | pass (server-set amount, no `plan` param) | live Paystack test transaction |
| Content revision conflicts; publication permissions | pass (version check) | pass (409, kept draft) | none |
| Migration compatibility and rollback | pass (both `down.sql` run clean) | n/a | run on the branch/test project with existing data |

**Exact steps once a test environment exists** (about 20 minutes): apply `20261014000000` then `20261015000000` through the Supabase SQL editor or `apply_migration`; create four auth users and sign each in to obtain a real JWT; run the SQL assertions in `tests/db/*.test.mjs` against the project's pooler connection (they take a connection string); call PostgREST directly with each JWT for insert/read/RPC attempts; run the rollback files in reverse order and re-apply. I will do this and record the results here as "Service-verified".

## 5. Blocked and disabled features (nothing shows fake success)
| Feature | State now | Missing dependency | Owner setup | Acceptance check |
|---|---|---|---|---|
| Image library | **Built** (upload, alt text, archive; PNG/JPEG/WebP only, re-encoded, no SVG, server-named files) | `site-assets` storage bucket is created by the migration; real Supabase Storage unverified | none beyond migration | upload a PNG, set it as the hero, see it on the landing page, archive refused while in use |
| Payment callback/webhook history | **Built** | migration `20261015000000` (`payment_events`) | none | open a payment: delivery rows appear after a test payment |
| Release builds, promotion, rollback (rows releases, release-detail) | Disabled panel naming the dependency | Vercel access token granted to the portal; a list of builds that passed checks | create a scoped token, add it as a production env var, tell me the approved-build source | list shows real builds; promote asks for step-up and records an audit event; rollback names the target |
| Maintenance jobs | **Built, allowlisted** (release expired offer holds only; no SQL/shell/upload) | migration | none | run shows count before and after the database confirms it |
| Support reply sending | Draft only; "not sent" is stated | verified sending domain/address and a mail provider | choose provider, verify domain | a test reply reaches a mailbox you own; ticket thread records it |
| Refund execution | Request and decision built; sending money back disabled | your authorisation to use the Paystack refund API with the live key | state in writing that refunds may be executed, after the policy exists | a test-mode refund executes once, twice is refused |
| Scan/download analytics | shown as "not measured" | instrumentation deliberately not added | decide whether to add a privacy-reviewed counter | n/a |
| Staff MFA enrolment | UI built, stand-in has no MFA | real Supabase MFA | enable TOTP in Supabase Auth | enrol, sign out, sign in with a code, AAL2 reaches `/admin` |
| Customer-facing legal/support details | Hidden until real values are entered | your Terms, Privacy, refund policy, monitored support contact | enter at Settings | footer shows them |

## 6. Owner access (bootstrap and MFA)
No one can become an Owner today (`OWNER_BOOTSTRAP_EMAIL` is unset everywhere). After approval: (1) enable TOTP MFA in Supabase Auth; (2) you tell me the exact email to use, **or** set it yourself as `OWNER_BOOTSTRAP_EMAIL` in the Production scope; I will not infer it; (3) sign up/sign in with that exact, email-verified address and open `/admin`; (4) the portal asks you to enrol an authenticator, then claims Owner once (the database allows only that identity and only while no Owner exists); (5) unset `OWNER_BOOTSTRAP_EMAIL`; (6) invite staff from /admin/staff. Revocation ends access immediately and is audited; the last active Owner cannot be removed.

## 7. Remaining real-service checks
| Check | Status |
|---|---|
| Staff sign-in, MFA, role change, revocation on real Supabase | Unverified (needs 3c and section 6) |
| Password-reset and confirmation emails | Unverified (Supabase email on the test project; owner opens the email) |
| Google sign-in and safe return navigation | Return-path logic Stand-in/code-verified (open-redirect test passes); Google flow Unverified |
| Paystack test-mode checkout, callback, webhook | Stand-in verified; real test mode Unverified (needs 3c) |
| Test-mode renewal | Unverified; renewal pricing logic engine-verified |
| Security headers on a deployed preview | **Service-verified** for deployment `f0e98ca` (READY) on `/pricing`, fetched through the authenticated Vercel tool (headers are set by the app, so the fetch method does not change them): `Content-Security-Policy` (default-src 'self'; frame-ancestors 'none'; object-src 'none'; img/connect limited to the Supabase host), `Strict-Transport-Security: max-age=31536000`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` disabling camera/microphone/geolocation/payment/usb, `X-Robots-Tag: noindex` on the preview. Also confirmed: the page's `og:image` uses the preview host (the preview-origin fix works). Other routes not re-fetched. |
| Discounts: landing display -> checkout amount -> renewal | Landing display, checkout amount and renewal disclosure verified on stand-ins; payment/renewal on real Paystack unverified |
| Physical QR scanning | Owner-run, unverified: print the Pro and Free exports at 3 cm, scan with two phones and one dedicated reader; record the decoded text |
| Screen-reader pass | Owner-run, unverified: NVDA or VoiceOver through landing, create, checkout and one admin page; automated axe has 0 violations on all 55 test screens but is not a substitute |

## 8. Migrations, order and rollback
**Production order:** (1) take a backup (Supabase dashboard backup or `pg_dump` of schema `qrforge`); (2) apply `20261014000000_atomic_limits.sql`; (3) apply `20261015000000_admin_portal.sql`; (4) deploy the `control-panel` build; (5) enable MFA; (6) bootstrap the Owner (section 6). Both first on the test environment (3c).
**What each does.** `20261014`: saved-code quota enforced by trigger (Free users above 3 codes are not deleted, only blocked from adding), atomic payment functions. `20261015`: staff, audit (append-only), plan versions, campaigns/quotes/redemptions, support, content drafts/revisions/assets, `payment_events`, RLS with no customer access, `site-assets` storage bucket.
**Irreversible or lossy effects.** Rollback files drop the new tables, so audit rows, campaigns, quotes and payment events written after the migration are lost; the storage bucket and uploaded files are not removed by rollback; applied payments and entitlement changes are real money records and are never rolled back. Code rollback (promote the previous deployment, or a normal `git revert` on `main`; no force-push) never undoes data changes.
**Rollback order:** `supabase/rollback/20261015000000_admin_portal.down.sql`, then `20261014000000_atomic_limits.down.sql`; the app has fallbacks so the previous release keeps working on the older schema.

## 9. Remaining launch blockers and approvals requested
**Blockers:** quota fix unapplied; previews hold production secrets and are unprotected; no real-Supabase verification; no real-Paystack test-mode verification; legal/support details not supplied; credentials pasted in earlier chats not yet rotated; release integration, support email, refund execution not connected.
**I am requesting your decision on these specific actions; I will do nothing until you say yes to each:**
1. Test environment: Pro upgrade for a branch (I will quote the cost first) **or** a new project elsewhere.
2. Apply the Preview-scope env changes in 3c and enable Vercel Authentication on previews (I will also revoke the shareable-link token).
3. Apply both migrations to the test environment, then (separately) to production after backup.
4. The Owner email and the TOTP enrolment (section 6). Tell me whether `PAYSTACK_SECRET_KEY` in production is a test or live key.
5. Legal and support details; credential rotation.
Merging to `main` and a production deploy are **not** requested yet.

## Appendix: suites and results (final runs, this branch)
| Suite | Class | Result |
|---|---|---|
| `tests/db/admin.test.mjs` | Engine | 140 pass |
| `tests/db/limits.test.mjs` | Engine | 39 pass |
| `tests/e2e/inventory.mjs` (two phases) | Stand-in | all pass (638 checks; landing-offer re-run after cache wait) |
| `tests/e2e/roles.mjs` | Stand-in | 42 pass |
| `tests/e2e/checkout.mjs` | Stand-in | all pass |
| `tests/e2e/assets.mjs`, `webhook-history.mjs`, `session-nav.mjs` | Stand-in | all pass |
| `tests/e2e/admin-screens.mjs` | Stand-in | 160 pass |
| `tests/site-origin.ts`, `plans-sync.ts`, `content-image.ts` | Local | pass |
| `tsc`, ESLint | Local | 0 errors (17 warnings) |
