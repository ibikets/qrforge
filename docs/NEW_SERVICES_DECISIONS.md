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

## 2026-10-15 — Website-field crash (release 1 of this round)
- **Symptom:** typing into Website (Pages editor) showed "We couldn't load this page".
- **Cause (reproduced, first typed character `h`):** `TypeError: Cannot read properties of null (reading 'startsWith')`. The live preview built a public snapshot from the *raw* draft; `snapshotOf()` did `href: websiteUrl(value)!` (a non-null assertion on a value that is `null` for any unfinished address), and `CardView` then called `r.href.startsWith("http")`. Emails and phones were also put in the preview unchecked. Publishing was never affected (publish validates first), but any half-typed website crashed the whole editor.
- **Fix:** (1) one shared `rowProblem()` used by validation *and* the snapshot, so unfinished or unsafe rows are simply left out of the preview/snapshot (the raw text is never rewritten); (2) `websiteUrl()` rewritten with an explicit policy (see code comment: trim, no spaces/control characters, scheme optional → https, only http/https, no credentials, real domain, ≤300 chars, `host:port` accepted) and never throws; (3) `CardView` and `readSnapshot()` tolerate damaged rows; (4) a `PreviewBoundary` so a preview failure can never take the editor down; (5) inline validation shows after the person leaves a field (not while typing) and clears as soon as it is fixed; (6) the server uses the same `validateCard()` (HTTP 422, content kept on screen).
- **Draft policy (kept):** a draft with an unfinished/unsafe address is refused by the server with the field message; everything stays on screen and nothing else is lost. Publishing needs a finished address.
- **Evidence:** `tests/pages-url.ts` (policy table, 10 sample strings typed character by character incl. javascript:/data:/credentials/unicode/very long, paste = typed, snapshot, contact file, damaged stored snapshots) and `tests/e2e/url-typing.mjs` (41 browser checks: typing, partial/unsafe values, inline messages, refused save keeps content, several website and social rows, save, reload, publish, signed-out page, contact file, static contact editor). Class: Local + Stand-in (not real Supabase).
- **Open conflict recorded:** the 2026-10-15 brief says to keep the 30-day grace "provisionally"; the Owner's earlier chat message (2026-10-14 20:16) said **7 days**. The 7-day value is live and is kept until the Owner says otherwise (one constant: `GRACE_DAYS`).

## 2026-10-15 — Phase 3: business, multi-link and social pages (release 2 of this round)
- **Model:** one generic *sections* model (`lib/pages/blocks.ts`: header, text, contact buttons, link list, social profiles, opening hours, location, button) behind a per-kind *engine* (`lib/pages/kinds.ts`). The create, save, publish, restore, media and public routes call `engineFor(kind)` and are otherwise kind-agnostic, so Phases 4–5 add engines rather than routes. The original card keeps its own model (v1 snapshots) untouched; sections use v2 snapshots. A damaged or foreign snapshot is never rendered (neutral page).
- **Presets (what each kind allows):** Business: text, contact buttons, hours, location, links, socials, button; portrait + logo; business contact file. Multi-link: links (max 30), socials, text, button; needs ≥1 link to publish. Social: socials (max 12), links, text; portrait only; needs ≥1 profile. Caps by section type are enforced in `normaliseContent`, not only in the UI.
- **Rules kept from cards:** opaque never-reused address; draft vs immutable published snapshot (last 20); hidden sections and private rows never enter a snapshot or a restored draft; draft_version compare-and-set; atomic publish; staff takedown; 7-day grace; quotas count every kind against the same 5/25 pages and 25/100 MB.
- **Links:** only http(s) via the shared website policy; phone → `tel:`, WhatsApp → `https://wa.me/…` (international form required), directions → a Google Maps *search* link built from the address (no map embed, no third-party script); duplicates flagged (social handles compared by resulting profile address).
- **Hours:** per day open/close or closed, with an explicit IANA time zone, shown as written ("Lagos time"). No "open now" claim is made.
- **Business contact file:** vCard 3.0 organisation card (name, public phones/emails/websites/profiles, address). Never a photo, never private rows.
- **Editor:** section list with add / hide / remove / Move up / Move down (keyboard-operable, focus kept), link reorder, inline validation after leaving a field, live preview inside the error boundary, conflict/restore/publish dialogs as for cards.
- **Staff:** the admin Pages list shows each page's type; takedown/re-enable work for all kinds (kind-agnostic).
- **Database:** `supabase/migrations/20261017000000_page_kinds_and_files.sql` (+ rollback) widens the `kind` check and adds the file/media kinds Phase 4 needs. **Until the Owner runs it, creating a new-type page returns a clear "being set up" message (HTTP 503) and cards are unaffected.** Tested on the Engine (`tests/db/kinds.test.mjs`, 34 checks, incl. rollback/re-apply).
- **Evidence (Local/Stand-in, not real services):** `tests/pages-blocks.ts` (unit, ~60 checks); `tests/e2e/blocks.mjs` (browser: chooser, create/edit/validate/reorder/hide/publish/anonymous view @390/contact file/restore guard/server refusals/labels/console); regressions pages (109), url-typing (41), create-reset, contact-photo, Engine pages (40).
- **Not done:** signed-in live verification on production (needs the migration and a real session), physical phone scan, screen-reader run.

## 2026-10-15 — Billing page regression (priority fix)
- **Symptom:** /billing showed "We couldn't load your billing details" for every signed-in user.
- **Root cause (evidence):** signed-in users have column-level SELECT on `subscriptions` (user_id, plan, current_period_end, auto_renew, updated_at) and `payments` (reference, plan, amount_kobo, status, created_at). The offers/admin migration added `subscriptions.renewal_kobo` and `payments.discount_kobo`; they were never granted to that role. The billing page selected them with the user's session; Postgres answers **42501 permission denied** (read-only check on production: `set local role authenticated; select renewal_kobo …` → 42501; the granted columns succeed). The page only fell back on 42703 (undefined column), so the failure became the error panel. Not caused by the hosted-pages migrations or Phase 3 code; it began when the admin/offers migration was applied. Data, subscriptions and payment history were never touched.
- **Fix (smallest, no grant changes):** the page now reads only granted columns with the user session, and reads `renewal_kobo` / `discount_kobo` separately with the server-side client, filtered to the signed-in user's own rows. If the renewal price cannot be read it is omitted (never guessed); unknown offer savings are not shown. A failed read still shows the error; an empty history still says "No payments yet."
- **Regression test:** the local database stand-in now enforces production's column grants (browser-session query on any other column → 42501). `tests/e2e/billing-page.mjs` failed 6/6 before the fix and passes after; checkout, webhook-history, session-nav, security, pages, blocks, a11y re-run.
- **Not changed:** database grants, subscriptions, payments, plan dates, Paystack code. Evidence class: Stand-in + read-only production SQL; the live page needs a signed-in check by the Owner (not performed here).

## 2026-10-15 — Icon actions and Save contact (card and business pages only)
- **Scope kept narrow:** only the public card, the business/link/social public pages and their editor previews changed. No other buttons, no schema, no data changes. Shared components touched: `CardView` and `BlocksView` (action area), contact-file response header, test selectors.
- **Icons:** `react-icons` 5.7 (MIT wrapper; Font Awesome Free brand icons CC BY 4.0, Lucide ISC), imported per icon. Call, WhatsApp, Email, Website, Share, Save contact and Instagram/LinkedIn/X/Facebook/TikTok/YouTube/GitHub/other-link. No emoji. 48 px targets, text accessible names (e.g. "Call: +234…"), `title` tooltips plus a visible caption under each icon (no hover dependence).
- **Several entries:** one number/email/website = direct link; several = an inline labelled list opens under the bar (Escape/Close returns focus). Nothing is dropped; the full text lists stay on the page. Social profiles: every profile as an icon; name carries platform and handle.
- **Share:** native share sheet when available, otherwise copies the link and announces "Link copied".
- **Save contact:** a plain link (no `download` attribute) to `/p/<id>/contact.vcf`, served `text/vcard; charset=utf-8` with `Content-Disposition: inline` and a safe filename, so a browser that can hand a vCard to the OS contact handler is not forced into a file download. **Limits (honest):** no official platform documentation guarantees an "Add contact" sheet from a web link; iOS Safari commonly shows its contact card for inline `text/vcard`, Android Chrome normally downloads the file and the user taps it to import. The OS always asks for confirmation; the page never claims "contact saved". Not verified on a physical iOS or Android device from here.
- **"Save contact (preview)":** this was the *editor preview* (vcf link is null there by design), not a shipped public state. Published cards link to the real file; the preview now shows a disabled icon and the line "Preview only. Save contact works on the published page."
- **Evidence (Stand-in/Local):** `tests/e2e/icons.mjs` (targets ≥44 px, names, choosers list every entry, Escape/focus, share both paths, save link/headers/contents, axe WCAG 2.1 AA, 390 px, 200 % reflow); screenshot inspected; pages, blocks, url-typing, contact-photo re-run with updated selectors.

## Phase 4: documents, collections, galleries, resumes, presentations (Oct 2026)

**What shipped.** Five page kinds on the existing section engine (same drafts, revisions, publish RPC, stable URL and QR): `document`, `collection`, `gallery`, `resume`, `presentation`. New sections: `file` (PDF upload *or* https link), `documents` (ordered list), `gallery` (images with alt text and captions), `entries` (experience/education). Header gains an optional cover image for document, collection and presentation pages. No migration beyond 20261017000000 (already applied).

**File safety (what is and is not claimed).**
- Content, not name or browser MIME, decides: images are decoded by sharp with pixel limits, re-encoded to WebP and stripped of EXIF/location; a thumbnail is stored beside the original.
- PDFs are **rebuilt from page content only** (pdf-lib): scripts, launch actions, embedded files, forms, annotations/links and metadata are not carried over. Limits: 10 MB, 300 pages. This is *not* malware scanning. Residual risk: a crafted PDF could still target a parser bug in pdf-lib at upload time, or in the visitor's PDF reader after download. Hence delivery is **download-only** (attachment, nosniff, no-store, never embedded). Inline preview stays off until a hardened renderer is chosen.
- The site-wide proxy CSP replaces any per-route CSP; the attachment disposition is the control relied on.
- Originals stay in the private `page-media` bucket. Public access needs the file to be referenced by the *currently published* version; owner access needs ownership of the page. Draft-only, replaced, unpublished and taken-down files return 404 at once (responses are not cached).
- External document links must be https and are **never fetched** by Qrenuvi (no SSRF surface); visitors see the host before leaving.
- Quotas stay server-side (plan_limits, triggers QF011/QF012, 60 files per page). Retried identical uploads return the existing file (sha256). Failed uploads remove what they stored. Non-card kinds keep only draft + live files, so older revisions restore without removed files.
- Upload route limit raised from 30 to 90 requests/minute per user so a 40-image gallery can be built in one sitting.
- The contact file (`contact.vcf`) is now explicitly business-only; a resume shows its details on the page and offers no Save contact.

**Proposed allocations (no price or entitlement change).** Pro 25 MB and Business 100 MB unchanged. A 10 MB PDF and 5 MB images fit; typical re-encoded gallery images are well under 1 MB. Storage cost scales with Supabase plan limits; verify the current provider limit before any paid upgrade.

**Not done / manual.** Staff usage view shows page kind only (per-account file count/bytes not yet in the admin list). Physical-phone viewing of downloads, screen-reader testing and signed-in production checks are manual.

## Digital card visual refresh (Oct 2026)

Scoped, presentation-only change to published cards and their editor preview (and, through the same components, business and other section pages). No change to billing, authentication, contact-file logic, payloads or other screens.

- One set of components serves preview and published view: `CardHeader`, `ContactRows`, `ActionBar`, `SocialIcons`, theme in `card-theme.ts`. Colours come from CSS variables set on the card's own `<article class="qcard">` from the customer's chosen accent, so nothing leaks to the dashboard.
- Header: accent gradient, ringed portrait, tighter type, logo chip; body overlaps the header with a rounded top edge.
- Call follows the card accent; WhatsApp, Email, Website and Share have fixed restrained tint/glyph pairs. Social icons use platform identities (Instagram gradient, LinkedIn blue, YouTube red, Facebook blue, X/TikTok/GitHub black) in a wrapping, centred row.
- Save contact is a full-width accent button on published cards. In the editor it is a dashed, grey, non-interactive control with a short note; it is never a link there.
- Contact rows: tinted icon chip, small label, value; 56px rows; section headings use the accent.
- Evidence: Playwright at 320/390/1280 (long names, no photo, several numbers/emails, four accents), axe wcag2a/aa/21aa clean at 390, every link and button at least 44x44, keyboard Tab reaches Call, Save contact and social links. Screenshots in `docs/card-look/`. Not done: physical-device viewing and a screen-reader pass.
