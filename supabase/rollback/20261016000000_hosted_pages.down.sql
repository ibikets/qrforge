-- Reverts 20261016000000_hosted_pages.sql. DESTROYS hosted pages, revisions and media records.
-- BEFORE running: take the logical backup in docs/NEW_SERVICES_DECISIONS.md (section Backup & recovery), and
-- remove files from the 'page-media' bucket (Storage UI) - dropping tables does not delete stored objects.
begin;
drop trigger if exists pages_quota on qrforge.pages;
drop trigger if exists page_media_quota on qrforge.page_media;
drop function if exists qrforge.publish_page(uuid, uuid, integer, jsonb);
drop function if exists qrforge.enforce_page_quota();
drop function if exists qrforge.enforce_media_quota();
drop function if exists qrforge.active_plan(uuid);
drop table if exists qrforge.page_media;
drop table if exists qrforge.page_revisions;
drop table if exists qrforge.pages;
alter table qrforge.plan_limits drop column if exists max_pages;
alter table qrforge.plan_limits drop column if exists max_media_bytes;
commit;
