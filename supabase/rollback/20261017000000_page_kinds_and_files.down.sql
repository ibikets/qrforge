-- Reverts 20261017000000_page_kinds_and_files.sql. DESTROYS every hosted page that is not a Digital Business Card
-- and every image/PDF record that is not a portrait or logo. Take a backup first (docs/NEW_SERVICES_DECISIONS.md) and
-- remove the matching files from the 'page-media' bucket (Storage UI): dropping rows does not delete stored objects.
begin;
delete from qrforge.page_media where kind not in ('portrait','logo') or mime = 'application/pdf';
delete from qrforge.pages where kind <> 'card';
alter table qrforge.page_media drop column if exists original_name;
alter table qrforge.page_media drop column if exists meta;
alter table qrforge.pages drop constraint if exists pages_kind_check;
alter table qrforge.pages drop constraint if exists pages_draft_check;
alter table qrforge.page_revisions drop constraint if exists page_revisions_content_check;
alter table qrforge.page_media drop constraint if exists page_media_kind_check;
alter table qrforge.page_media drop constraint if exists page_media_mime_check;
alter table qrforge.page_media drop constraint if exists page_media_bytes_check;
alter table qrforge.pages add constraint pages_kind_check check (kind in ('card'));
alter table qrforge.pages add constraint pages_draft_check check (jsonb_typeof(draft) = 'object' and octet_length(draft::text) <= 30000);
alter table qrforge.page_revisions add constraint page_revisions_content_check check (octet_length(content::text) <= 30000);
alter table qrforge.page_media add constraint page_media_kind_check check (kind in ('portrait','logo'));
alter table qrforge.page_media add constraint page_media_mime_check check (mime in ('image/webp','image/png','image/jpeg'));
alter table qrforge.page_media add constraint page_media_bytes_check check (bytes > 0 and bytes <= 2000000);
do $$ begin
  if to_regclass('storage.buckets') is not null then
    update storage.buckets set file_size_limit = 2000000, allowed_mime_types = array['image/webp','image/jpeg','image/png'] where id = 'page-media';
  end if;
end $$;
commit;
