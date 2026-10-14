-- Reverts 20261014000000_atomic_limits.sql. Data in qr_codes / payments / subscriptions is untouched.
-- The app keeps working afterwards: it falls back to its in-app limit check and non-atomic payment path.
begin;
drop trigger if exists qr_codes_entitlements on qrforge.qr_codes;
drop function if exists qrforge.enforce_code_entitlements();
drop function if exists qrforge.apply_payment(text, uuid, text, integer, text, text, boolean, integer);
alter table qrforge.qr_codes drop constraint if exists qr_codes_type_check;
alter table qrforge.qr_codes drop constraint if exists qr_codes_fields_size;
alter table qrforge.qr_codes drop constraint if exists qr_codes_style_size;
alter table qrforge.qr_codes drop constraint if exists qr_codes_json_objects;
revoke update on qrforge.qr_codes from authenticated;
grant update on qrforge.qr_codes to authenticated;
drop table if exists qrforge.plan_limits;
commit;
