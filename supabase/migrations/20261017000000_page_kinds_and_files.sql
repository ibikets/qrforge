-- Qrenuvi: more hosted page kinds (business, links, documents, galleries, menus, events ...) and PDF/image files.
-- Additive: relaxes four CHECK constraints on the hosted-page tables (never narrows them), adds two nullable/defaulted columns,
-- raises the per-page file cap and the storage bucket's limits. No existing row, price or limit is changed.
-- Rollback: supabase/rollback/20261017000000_page_kinds_and_files.down.sql
-- The app treats the new kinds as "not available yet" until this is applied, so migrate first, then deploy.
begin;

-- Drop whichever auto-named CHECKs guard these columns, then add explicit ones (idempotent).
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname
    from pg_constraint c
    where c.contype = 'c'
      and c.conrelid in ('qrforge.pages'::regclass, 'qrforge.page_revisions'::regclass, 'qrforge.page_media'::regclass)
      and (
        (c.conrelid = 'qrforge.pages'::regclass          and (pg_get_constraintdef(c.oid) ilike '%kind%' or pg_get_constraintdef(c.oid) ilike '%draft%'))
        or (c.conrelid = 'qrforge.page_revisions'::regclass and pg_get_constraintdef(c.oid) ilike '%content%')
        or (c.conrelid = 'qrforge.page_media'::regclass     and (pg_get_constraintdef(c.oid) ilike '%kind%' or pg_get_constraintdef(c.oid) ilike '%mime%' or pg_get_constraintdef(c.oid) ilike '%bytes%'))
      )
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

alter table qrforge.pages add constraint pages_kind_check check (kind in
  ('card','business','links','social','document','collection','gallery','resume','presentation','menu','product','event','campaign','coupon'));
alter table qrforge.pages add constraint pages_draft_check check (jsonb_typeof(draft) = 'object' and octet_length(draft::text) <= 120000);
alter table qrforge.page_revisions add constraint page_revisions_content_check check (octet_length(content::text) <= 120000);

alter table qrforge.page_media add constraint page_media_kind_check check (kind in ('portrait','logo','image','file'));
alter table qrforge.page_media add constraint page_media_mime_check check (mime in ('image/webp','image/png','image/jpeg','application/pdf'));
alter table qrforge.page_media add constraint page_media_bytes_check check (bytes > 0 and bytes <= 12000000);
alter table qrforge.page_media add column if not exists original_name text check (original_name is null or char_length(original_name) <= 120);
alter table qrforge.page_media add column if not exists meta jsonb not null default '{}'::jsonb check (jsonb_typeof(meta) = 'object' and octet_length(meta::text) <= 2000);

-- Per-page file cap 8 -> 60 (the plan's storage allowance in plan_limits.max_media_bytes remains the real limit).
create or replace function qrforge.enforce_media_quota() returns trigger
language plpgsql security definer set search_path = pg_catalog, qrforge as $$
declare v_lim qrforge.plan_limits%rowtype; v_bytes bigint; v_n integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('qrforge.media:' || NEW.user_id::text, 0));
  select * into v_lim from qrforge.plan_limits where plan = qrforge.active_plan(NEW.user_id);
  select coalesce(sum(bytes + vcf_bytes), 0), count(*) filter (where page_id = NEW.page_id) into v_bytes, v_n
    from qrforge.page_media where user_id = NEW.user_id;
  if v_n >= 60 then raise exception 'too many files on this page' using errcode = 'QF012'; end if;
  if v_bytes + NEW.bytes + NEW.vcf_bytes > v_lim.max_media_bytes then
    raise exception 'media storage limit reached' using errcode = 'QF011', hint = 'limit=' || v_lim.max_media_bytes;
  end if;
  return NEW;
end $$;
revoke all on function qrforge.enforce_media_quota() from public, anon, authenticated;

do $$ begin
  if to_regclass('storage.buckets') is not null then
    update storage.buckets set file_size_limit = 12000000, allowed_mime_types = array['image/webp','image/jpeg','image/png','application/pdf'], public = false
     where id = 'page-media';
  end if;
end $$;

commit;
