-- Reverts 20261020000000_content_import.sql. Deletes import history (and the one-step undo copies). Imported items already in page drafts stay.
begin;
drop table if exists qrforge.import_jobs;
alter table qrforge.plan_limits drop column if exists max_import_rows;
commit;
