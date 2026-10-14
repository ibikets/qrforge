# New services: implementation decisions, lifecycle policy and handoff

Status as of 14 Oct 2026. Covers the design handoff "Qrenuvi New Services" (read in full) against the real codebase.
Evidence classes used below: **Engine** = real Postgres engine (embedded, not Supabase); **Stand-in** = built app + local fake Supabase/Paystack in a real browser; **Local** = unit-level; **Not done** = could not be performed here.

## 1. What is delivered

| Phase | Scope | Status |
|---|---|---|
| Foundations | Publishing + revisions, private media, entitlements + atomic quotas, structured content, customer-side permissions (owner-only), staff takedown | **Built for hosted cards** (reusable by later page kinds) |
| 1 | Static vCard photo (contact-file only), CRLF/folding, semicolon-escape fix | **Done** |
| 2 | Hosted Digital Business Card (editor, photo/logo, publish/revisions/unpublish/delete, public page, contact download, stable URL + QR, staff takedown, quotas) | **Done** |
| 3 to 7 | Business/multi-link pages, documents/galleries/resumes, menus/products/events/coupons, dynamic links + reporting, forms/folders/brand/bulk/workspaces | **Not built in this slice.** Foundations are in place; see section 6 |
| Specialist modules | Tickets, redemption, pet/medical tags, GS1, wallet passes, domains, integrations | Backlog (unchanged) |

Hosted cards are live only after the migration `20261016000000_hosted_pages.sql` is applied (section 5). Until then every customer screen says "not available yet" and the public address shows the neutral unavailable page.

## 2. Design adjustments and why

1. **Entitlements are code + database rows, not a UI toggle.** The package asked for "proposals, not silently activated". Implemented as `plan_limits.max_pages` / `max_media_bytes` (Free 0, Pro 5 / 25 MB, Business 25 / 100 MB) plus `lib/plans.ts`, kept in sync by `tests/plans-sync.ts`. **No price changed and no existing right removed.** Free keeps the full static generator. The Pro/Business pricing copy does **not** yet advertise hosted cards: add the feature line only after production verification (owner decision, one-line change in `lib/plans.ts`).
2. **Routes.** `/workspace/pages…` and `/p/:publicId` as designed. `/r/:publicId` (redirects) belongs to phase 6 and is not created. The 78-row SCREEN-INVENTORY.csv is used as a ledger of states, not as a route list.
3. **Customer data access goes through server routes with the service role plus explicit owner filters; the browser has no database access to page tables at all** (RLS enabled, all privileges revoked from `anon`/`authenticated`). The existing saved-code tables use RLS with the user's token; for pages we chose deny-by-default because publishing, takedown and media need server-side orchestration anyway, and it gives one enforcement point that the Engine tests exercise directly.
4. **Quotas where the data lives.** Page and media quotas are database triggers using per-user advisory locks (same pattern as saved codes). Publishing is an atomic database function (`publish_page`): ownership, version check, plan entitlement, revision insert and pointer swap in one transaction.
5. **Public rendering is per-request; only the database read is cached** (`"use cache"` + tag, expired with `{expire: 0}` on publish/unpublish/delete/takedown). We first tried caching the whole page and a browser test caught that the first view after unpublish still showed the card (stale-while-revalidate). Unpublish and takedown now take effect on the next request. Public **images and the .vcf** carry `max-age=300`, so a shared-cache copy may outlive an unpublish by up to 5 minutes (documented, deliberate).
6. **Media.** Private bucket `page-media`; the server inspects content (PNG/JPEG/WebP only, single frame, pixel cap), applies EXIF orientation then re-encodes (location data removed), crops the portrait square to the user's chosen region (512 px WebP) and makes a 192 px JPEG used only for the contact file. Originals are **not kept** (privacy over re-crop convenience). Public images are served only if referenced by the published revision. The package's "5 MB" upload cap is kept.
7. **Public-field privacy.** Rows have a per-row "show publicly" flag. Revisions store only the public snapshot (allowlist), so private details are not recoverable from history, and the restore screen says so.
8. **No arbitrary HTML.** Fields render as React text; links come only from `tel:`, `mailto:`, `https://wa.me/…`, and validated http(s) URLs. A test confirms `<b>` in the intro is escaped.
9. **Static vCard.** Encoder emits vCard 3.0. Findings: a photo inside the QR would make it unscannable (a 6 KB JPEG is about 8.8 KB of base64, beyond the largest QR payload at useful error correction), so **the QR never contains a photo**. The optional photo (160 px JPEG, about 1 KB to 7 KB) is stored in the record only for the downloadable `.vcf`, which is CRLF, folded to 75 octets, with `PHOTO;ENCODING=b;TYPE=JPEG`. Static semantics are unchanged: no hosting, no editing after printing. One bug fixed on the way: `vEsc` did not escape semicolons (`"\;"` is `;` in JS); static name fields already forbid `;`, so existing codes are unaffected, hosted fields rely on the fix.
10. **Photo cropping is accessible without a pointer**: arrow keys, +/-, zoom slider and four move buttons, tested by keyboard.
11. **Conflict handling** uses an expected-version compare-and-swap on save, publish and restore; a conflict keeps the user's edits on screen and offers "keep my edits" or "load the latest" with a field-level summary.
12. **Deleted pages** are soft-deleted; the opaque public ID is never reused (unique constraint covers tombstones). Images are removed at delete. A "restore deleted page" UI is not built (the design allows it as a later add).
13. **Quota semantic.** Deleting frees a page slot; images are garbage-collected when no draft or kept revision references them, so replaced photos stop consuming storage. History keeps the last 20 revisions.

## 3. Lifecycle policy for hosted pages (the "explicitly selected" policy)

Chosen from the design's recommendation, to be confirmed by the Owner; it is implemented, not just described:

- **Active Pro/Business plan:** create, edit, publish, restore, replace images. Within the plan's page and storage limits.
- **Plan lapses (no renewal):** published pages **stay publicly visible for 7 days** (grace; Owner-confirmed 2026-10-14). During grace the owner can still unpublish or delete, but cannot create, edit, upload or publish (read-only). Renewing restores everything.
- **After 7 days without renewal:** public address shows the neutral "This page isn't available" page (also images and the contact file). Nothing is deleted: renewing makes the page public again. There is no automatic deletion in this release; a retention/deletion rule and a "your page is about to go offline" email require the email provider (not configured) and an Owner decision.
- **Downgrade to Free** behaves the same as lapse.
- **Unpublish:** immediate; record and revisions kept. **Takedown (staff abuse action):** immediate, blocks republishing, audited with reason; Support and Owner only; staff see title, status and address, never content.
- **Static codes** keep their existing behaviour; they do not depend on these rules.
- Printed QR codes of an unavailable page show the neutral page. We do not promise lifetime availability.

Dynamic redirect expiry (phase 6) is not built; the same grace principle is recommended.

## 4. Release gaps from the earlier brief

| Item | State |
|---|---|
| Preview isolated from production credentials | **Done (Service-verified):** `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL` now exist for **Production only**. Previews have no service-role key: management and hosted pages show honest "not configured" there. `OWNER_BOOTSTRAP_EMAIL` was already production only |
| Preview protection | **Done (Service-verified):** Vercel Authentication enabled for preview deployments (project setting `ssoProtection: preview`). The production alias is unaffected. Obsolete sharing link: the earlier bypass link was never created from this workspace; none exists in project settings |
| Isolated test database | **Not available:** the organisation is at the free two-project limit, so a branch/second project is a paid or new-org decision. Migrations were instead tested on a real Postgres engine (Engine class) including concurrency and rollback; they are additive |
| Reconcile migrations with live DB | Live DB already has migrations 1 and 2 (verified earlier). Migration 3 is additive and idempotent (tested twice-applied) |
| Owner activation | Still needs you: `/admin/login/forgot` with the Owner email, set a password of 12+ characters, sign in, "Set up the Owner account", enrol an authenticator app. Not done by me |
| Support email, refunds execution, credential rotation | Not done: need provider/identity facts and your authorisation (see section 7) |

## 5. Backup and recovery for the production migration

The migration only **adds** tables/functions/policies and changes two new columns' values on the 3 `plan_limits` rows (existing columns untouched). Procedure used:

1. Read-only snapshot before: row counts of every `qrforge` table, the 3 `plan_limits` rows, trigger/function inventory (`select` queries; saved outside the repo because they hold customer data).
2. Apply `supabase/migrations/20261016000000_hosted_pages.sql` in one transaction.
3. Verify after: counts identical for pre-existing tables, new tables empty, `plan_limits` `max_pages` 0/5/25, triggers present.
4. Rollback (tested on Engine, including re-apply): `supabase/rollback/20261016000000_hosted_pages.down.sql`. It drops only the new objects; before running it after pages exist, empty the `page-media` bucket in the Storage UI. Free-plan projects have no point-in-time recovery, so for data-bearing rollbacks take a logical dump first (`pg_dump --schema=qrforge`) from a machine that can reach the database.

## 6. Remaining scope and how to continue

Phases 3 to 7 reuse: `pages` (add kinds to the `kind` check and a validator per kind), `page_revisions`, `page_media`, `publish_page`, the media pipeline, `CardView`-style renderers, `pages.*` staff capabilities and the entitlement columns. Each needs its own editor, validator and public view; none was started. Dynamic redirects need a separate `redirects` table, `/r/:id` route, SSRF-safe URL handling and queue-based analytics. Forms/notifications need an email provider (not configured). Bulk and agency workspaces need workspace/membership tables and customer-role permissions (separate from staff roles); today every page is owned by one user.

## 7. Required owner actions

1. Owner activation (password, MFA) at `/admin/login/forgot`.
2. Confirm the lifecycle policy in section 3 (7-day grace, confirmed; no auto-deletion).
3. Decide Pro/Business page limits (5/25) and add the pricing copy line when satisfied.
4. Add `https://<production host>/admin/auth/callback` to the Supabase Auth redirect allow-list if staff recovery emails do not land (unverified).
5. A support email address and email provider (needed for notifications, expiry warnings, form alerts).
6. Test-mode Paystack run and a physical phone scan/contact import (I cannot perform these here).
7. Credential rotation (exposed keys) needs your confirmation that dependent integrations can be updated; not done.

## 8. Infrastructure and cost notes (no prices verified here)

Additional load: image uploads (CPU for `sharp`, up to 5 MB per request), private storage (capped per plan: 25 MB Pro, 100 MB Business per account), database reads per card view (3 small queries, cached in-process per instance and expired on change), image/contact downloads (about 25 KB per card view with photo). Check current Vercel/Supabase plan quotas before promoting; the free Supabase tier has no automatic backups or PITR.

## 9. Test evidence and limits

- Engine (`tests/db/pages.test.mjs`, 40 checks): quotas under 20 concurrent creates, atomic concurrent publish (10 parallel, distinct revisions), stale-version conflict, takedown/lapse/archive guards, tombstone uniqueness, media quota/SVG mime, users cannot read/write/call anything through the data API, rollback + re-apply. Existing suites: limits 34, admin 135 pass.
- Stand-in browser (`tests/e2e/pages.mjs`, `contact-photo.mjs`, roles matrix extended): full create/edit/photo/publish/recipient/vcf/QR-decode/unpublish/takedown/lapse/free flows, tenant isolation by owner filter, file validation by content, EXIF removal verified on stored bytes, 390/320 px layout, axe (WCAG 2.1 AA) on editor and card, keyboard-only crop and reaching Save contact. Regression: contact-rows 80, security 34, checkout, session-nav, a11y 27, admin-screens 160 pass.
- Limits: stand-in PostgREST/Storage are not Supabase (storage policy, signed URL behaviour and the real `page-media` bucket are unverified until the migration runs live); no physical-phone scan or contacts-app import; no screen-reader run; no real MFA; no real Paystack; production/preview URLs cannot be browsed from this sandbox (proxy), so post-deploy smoke is by HTTP only.

## Release record (2026-10-14)
- Migration `20261016000000_hosted_pages.sql` applied to production by the Owner via the SQL editor. Read-only verification afterwards: 28 tables in `qrforge`; `plan_limits` max_pages free 0 / pro 5 / business 25; max_media_bytes 0 / 25 MB / 100 MB; bucket `page-media` private; qr_codes 2, subscriptions 1, payments 1 (unchanged from the pre-migration snapshot).
- `new-services` merged to `main` (--no-ff, 4cf5530); production deployment dpl_8cDUEb3C4JTdNLATDAvT9KWcqME2 READY, aliased to qrforge-henna.vercel.app; no runtime errors reported.
- Production smoke evidence is limited: the sandbox shell cannot reach the site, and a text-only fetch of `/p/<unknown>` and `/workspace/pages` returned the streamed shell ("Loading…"), which does not prove the rendered result. A real browser check of `/p/<unknown>` (expect the neutral "isn't available" page), signing in, and creating/publishing a card is still owed (Not done).
- Pricing copy for hosted cards is not yet added (Owner decision after live verification).
