-- Reverts 20261019000000_dynamic_links.sql. DESTROYS every dynamic link and its open counts: printed QR codes that point at
-- /l/<id> addresses will stop working. Take a backup first.
begin;
drop trigger if exists links_quota on qrforge.links;
drop function if exists qrforge.enforce_link_quota();
drop function if exists qrforge.record_link_open(uuid, text, text, boolean);
drop table if exists qrforge.link_daily;
drop table if exists qrforge.links;
alter table qrforge.plan_limits drop column if exists max_links;
commit;
