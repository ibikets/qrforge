# QRFORGE launch readiness (14 October 2026)

## 1. State and evidence ledger

| Item | Value |
|---|---|
| Production deployment | Vercel `dpl_6p3Uaw4vKJv1GPXh75FDTxEd9W26`, READY, target production, built from `main` at `2119e54` (REAL-READ via Vercel) |
| Repository `main` before this pass | `2119e54`. Same commit, so the Working Desk / Forest redesign is live and Vercel auto-deploys from GitHub. An earlier report that the live site might not show the redesign is resolved. |
| This pass | Branch `launch-readiness`, not merged. Pushing to `main` would deploy to production, so it waits for approval. |

| Evidence type | What it covers |
|---|---|
| Stand-in tests (local Supabase/Paystack fakes, local Postgres engine) | Saved codes 32, payments 27, anonymous/pricing/auth 55, server boundaries 25, security regression 32, database migration/concurrency/RLS 34, keyboard/zoom/a11y 27, layouts at five widths. These prove code behaviour, not the behaviour of the real services. |
| Real-service reads (this pass, read-only) | Vercel project, deployment, environment variable names/types. Supabase policies, grants, RLS flags, advisor, row counts, and one non-identifying summary of the test payment row. Paystack public documentation. |
| Real-service writes | None. No charges, no migration, no production probes. |
| User-reported (not independently verified) | Google sign-in works; a test Pro purchase worked; Pro features were gated before purchase; a website QR and a vCard QR scanned on a phone; the Paystack webhook was added in the dashboard. |
| Consistent with the user's report (REAL-READ) | The real database holds one payment: Pro, 350000 kobo, status success; the subscription is Pro, 30.00 days from that payment, auto-renew on, card authorisation stored, and it points at that payment. This is consistent with a correct activation. It cannot tell whether the callback or the webhook applied it. |

## 2. QR reliability

Method: every combination (8 types x 3 styles x 4 sizes x logo on/off = 192) was exported through the real `/api/generate` route and each file was decoded by jsQR and by ZXing (ZXing C++ build, a widely used reference decoder). OpenCV was also tried and rejected as evidence: it failed 103 of 192 originals including plain square codes (and 73 with its Aruco detector), so it says little about our files.

| Check | jsQR | ZXing |
|---|---|---|
| 192 original PNG exports | 164 | **192** |
| Same files downscaled to 600 px | 184 | **192** |
| SVG exports (rasterised 300 and 1600 px), 48 each | 46 / 38 | **48 / 48** |
| PDF exports (150 and 300 dpi), 48 each | 46 / 46 | **48 / 48** |
| Brand palettes incl. forest-on-ivory, grey on white, inverted white-on-black (18 each) | 18, 18, 7 (grey), 18, 18 | **all 18** |
| Rotated 17°, blurred, JPEG q30 at 220 px, uneven light (16 per style each) | not run | **16/16 for every style** |
| Shrunk to 120 px (nearest) | not run | square 14, rounded 14, dots 13 of 16 |
| Control: the `qrcode` library's own standard PNG at five sizes | 39 of 40 | not run |

The 28 jsQR failures are all the round "Dots" style: 26 at 2048 px or larger, 2 at 512 px (the phone payload). Square and Rounded never failed.

What I ruled out, by changing one thing at a time (jsQR on the Dots style, 40 renders): square finder patterns (no change), square alignment and timing patterns (no change), the logo (failures identical with and without). Larger dots help jsQR but never fix it (45 of 72 at the current radius, 61 at +12%, 68 at +28%), and ZXing reads every variant. jsQR also fails 1 of 40 ordinary codes from another generator. I do **not** call this a pure decoder limitation: the Dots geometry (circles touching at a point) is measurably harder for a threshold-based decoder than the other styles, and ZXing's perfect result plus the distortion tests are why I believe real phone cameras cope.

Decision: no rendering change. I found no structural defect (error correction H, four-module quiet zone, finder patterns, alignment patterns and logo clearance are correct), and enlarging the dots would alter the approved look and still not make jsQR pass. Reliability on real phones and in print remains **unverified**; the owner checklist in `docs/OWNER_TEST_CHECKLIST.md` covers it.

Unverified: any phone camera scan except the two you reported (website and vCard, style and size unknown); printed output at any size; the Dots style on iPhone/Android cameras; logos other than the flat test logo; inverted colours on Android camera apps (the editor already warns).

## 3. Saved-code limit mechanism

A table cannot count rows per user in a CHECK constraint, so `supabase/migrations/20261014000000_atomic_limits.sql` uses a BEFORE INSERT trigger. It takes `pg_advisory_xact_lock(hash(user_id))`, then counts. Competing inserts for one user queue on the lock; in READ COMMITTED (the PostgREST default) the count after the lock takes a fresh snapshot, so it sees every insert that committed while it waited. Different users do not block each other. Limits come from a server-only `plan_limits` table that a test compares against `lib/plans.ts`. The same trigger enforces plan type, logo and size, and constraints bound row size, so every write path is covered: the app API, the Supabase data API with a user's token, and the SQL editor for non-superusers. The service role and superusers can bypass row-level security but not triggers; nothing in the app inserts saved codes with the service role. Updates cannot change `user_id` (column grant), and the existing own-row policy blocks reassignment.

Tests (local Postgres engine, 34/34): the race reproduced before the migration (12 saved on a limit of 3); after it 20 concurrent inserts stored exactly 3 and 120 on Pro stored exactly 100; direct data-API bypass attempts rejected; cross-user read, update, delete, insert and reassign denied; users cannot read billing columns, call `apply_payment`, or grant themselves a plan; 12 concurrent payments gave exactly 360 days; duplicates idempotent; expired Pro limited to 3; rollback leaves data untouched and the migration re-applies cleanly.

Apply order: migration, then deploy (either order works because the app falls back). Rollback: `supabase/rollback/20261014000000_atomic_limits.down.sql`. **Not applied to production; needs your approval.**

## 4. Authentication, ownership and payments on the real services

| Check | Result |
|---|---|
| Google sign-in and return navigation | User-reported working. Return-path validation tested on stand-ins. Not independently verified. |
| Password reset and email confirmation with real emails | **Unverified.** Needs a real mailbox; see owner checklist (also check Supabase Auth redirect URLs include `/auth/callback`). |
| Cross-user ownership on the real database | **Blocked.** The SQL prompt was cancelled twice, so I did not retry. Policies and grants were read from the real catalog and match what the stand-in tests exercise. To run it yourself paste `supabase/tests/ownership_rollback.sql` into the Supabase SQL editor; it rolls back. |
| Paystack test callback and webhook | Consistent with the real payment row (above). Webhook delivery **unverified**: Vercel runtime logs for the last hour were empty; check Paystack Settings, Webhooks, event log. I did not enter card details on the live checkout. |
| Duplicate and concurrent payment events | Stand-in and Postgres tests pass. Not exercised against Paystack. |
| Renewal and expiry | Stand-in tests only. A real card renewal has never run. |
| Webhook verification mechanism | DOCS: `x-paystack-signature`, HMAC-SHA512 of the raw body signed with your secret key. **There is no separate webhook secret.** Source IPs 52.31.139.75, 52.49.173.169, 52.214.14.220 can optionally be allow-listed. Retries: live every 3 minutes for four attempts then hourly for 72 hours; test hourly for 10 hours; reply 200. Test and Live mode have their own webhook URLs. Correction: my earlier advice to "use a new live webhook secret" was wrong; the live webhook uses the live secret key. |

## 5. Accessibility and visual review

Automated axe scan (WCAG 2.2 AA tags): 0 violations on every page at 1440 and 390 px, and on the landing page including the footer at 200%. At 200% (720 and 640 px) and 400% (320 px): no horizontal scrolling, footer in normal flow and not overlapping, dialogs fit and scroll. Keyboard: skip link first, footer links reachable, every stop has a visible 2 px outline, arrow keys/Home move between editor tabs, dialogs take focus, keep Tab inside the modal, return focus on Escape, and the delete dialog opens on the safe action. Footer text contrast 5.88:1. Two keyboard checks failed on my first run because of test timing and an assumption about native dialogs, and passed after correcting the test, not the product.

Not done: a real screen-reader run (NVDA, VoiceOver, TalkBack). I reviewed landmarks, heading order, field errors and live regions in the accessibility tree only. Status: **unverified**.

Screenshots (desktop 1440 and mobile 390): landing, Content and Appearance tabs, restricted-format export panel, upgrade dialog, saved codes, pricing, billing, sign-in, sign-up, forgot, reset-expired, confirm-email, account, signed-in generator, footer. Compared with the handoff gallery: the layout, forest/ivory/sage colours, Plex type and component set match. Deviations: the Size control is a slider with a numeric value, which the specification allows (the gallery mock shows a select); signed-out visitors see the top navigation instead of the rail (the gallery shows the signed-in rail); the status line reads "New code", where the gallery shows "Not saved". One defect found and fixed: the upgrade dialog said "your current website url details are unchanged" (a lowercased label).

## 6. Owner-supplied details still needed (no placeholders published)

**Terms of Service:** legal entity name, registration number and address; governing law and courts; refund and cancellation rules for 30-day passes and auto-renewal; acceptable-use rules for QR content; liability and availability wording; notice contact; effective date.
**Privacy notice (NDPA 2023):** controller name and contact; data protection officer if appointed; what is collected (email, Google profile, saved code content including WiFi passwords and contacts, payment references and a card authorisation token, logs); lawful bases; processors and regions (Supabase, Vercel, Paystack, Google); retention periods; how people exercise access and deletion rights (the app has no self-serve deletion or export yet); cookie and storage statement; breach contact.
**Support:** a monitored address, hours and a response time. "Priority support" returns to Business only if you confirm a real priority service with a stated response time; until then it stays off the plan and the payment-failure copy makes no support promise.

## 7. Credentials to rotate (names only, no values)

Rotate because they were pasted into chat. Then update the dependent setting and verify.

| Credential | Rotate in | Update | Verify afterwards |
|---|---|---|---|
| Supabase service-role key (and any Supabase personal access token or database password pasted) | Supabase dashboard, API settings | Vercel `SUPABASE_SERVICE_ROLE_KEY` (production and preview), redeploy | Billing page loads plan and card status; a test payment applies; run the cron route manually with the secret. If the JWT secret is rotated, all sessions end and the publishable key changes too. |
| Google OAuth client secret | Google Cloud console | Supabase Auth, Google provider | Sign in with Google from a private window; check the return path. |
| Paystack secret key (any live key pasted) | Paystack Settings, API Keys | Vercel `PAYSTACK_SECRET_KEY`, redeploy | Webhook signature accepted (Paystack event log shows 200); a test-mode purchase end to end. Events between rotation and deploy fail with 401 and are retried. |
| `CRON_SECRET` | Vercel | Vercel (Cron sends it automatically) | Cron route answers 401 without it and 200 with it. |

Going live is a separate approval: switch `PAYSTACK_SECRET_KEY` to the live key, add the webhook URL in Paystack's Live mode, and run one small real purchase yourself. I did not switch any payment credential or deploy.

## 8. Release checklist

| Status | Item |
|---|---|
| PASSED (stand-in) | Type check, lint, production build; 32 security regression tests; 34 database tests; saved codes, payments, auth and boundary suites rerun on the new build |
| PASSED (automated) | axe 0 violations; 200% and 400% zoom; keyboard and dialog focus; footer contrast |
| PASSED | Footer: dynamic year, company name linked to bitzpark.com (site checked: it is Bitzpark Limited's), in flow, not fixed |
| PASSED | Production deployment equals repository main; prod dependencies 0 vulnerabilities; no secrets in git history or client bundle (pattern scan) |
| PASSED (read) | Row-level security on; billing columns hidden from users; secrets stored as sensitive |
| FIXED, NOT DEPLOYED | Security headers, Origin checks, size/rate limits, logo verification, error leakage, payment error handling (branch `launch-readiness`) |
| FIXED, NOT APPLIED | Saved-limit race and direct-API bypass; atomic payments (migration awaiting approval) |
| USER-REPORTED | Google sign-in, test Pro purchase, gating, website and vCard scans |
| UNVERIFIED | Real reset and confirmation emails; real-database cross-user test; Paystack webhook delivery; real renewal charge; phone and print scans (Dots style especially); screen-reader run; live headers; global rate limiting |
| FAILED | None open. Earlier: dialog copy defect (fixed); jsQR cannot read round Dots at 2048 px or larger (not a confirmed product defect; ZXing reads all 192) |

**Launch blockers:** (1) approve and apply the migration; (2) merge the branch so the fixes deploy; (3) Terms, Privacy and a support contact published; (4) rotate the pasted credentials; (5) move preview deployments off production secrets and turn on Deployment Protection; (6) run the owner checklist items marked required; (7) live Paystack keys and webhook only after the above.
