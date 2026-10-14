-- Rolls back 20261015000000_admin_portal.sql. DESTRUCTIVE for portal data: staff, audit, quotes, redemptions, campaigns,
-- content, tickets and settings are dropped. payments and subscriptions keep their rows; the added columns are removed.
-- Take a backup first. Customer data (qr_codes, subscriptions, payments) is not otherwise touched.
begin;
drop function if exists qrforge.publish_content(text, integer, uuid);
drop function if exists qrforge.save_content_draft(text, integer, jsonb, uuid);
drop function if exists qrforge.adjust_entitlement(uuid, text, integer, text, text, uuid);
drop function if exists qrforge.release_expired_reservations();
drop function if exists qrforge.apply_quoted_payment(text, integer, text, text);
drop function if exists qrforge.reserve_redemption(uuid, text);
drop function if exists qrforge.issue_quote(uuid, text, text, text, boolean, interval);
alter table qrforge.payments drop column if exists quote_id, drop column if exists base_kobo, drop column if exists discount_kobo,
  drop column if exists campaign_id, drop column if exists campaign_version;
alter table qrforge.subscriptions drop column if exists renewal_kobo;
drop table if exists qrforge.app_settings, qrforge.ticket_messages, qrforge.support_tickets, qrforge.content_published,
  qrforge.content_revisions, qrforge.content_drafts, qrforge.entitlement_adjustments, qrforge.refund_requests,
  qrforge.redemptions, qrforge.quotes, qrforge.campaign_versions, qrforge.campaign_targets, qrforge.campaigns,
  qrforge.plan_versions, qrforge.customer_notes, qrforge.customer_profiles, qrforge.audit_events,
  qrforge.staff_invites, qrforge.staff_members cascade;
drop function if exists qrforge.plan_version_guard();
drop function if exists qrforge.audit_immutable();
drop function if exists qrforge.protect_last_owner();
commit;
