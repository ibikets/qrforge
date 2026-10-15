-- Qrenuvi: delivery tracking for support replies sent by email (Resend). Additive; safe to run once.
-- Run by pasting the CONTENTS of this file into the Supabase SQL editor.

alter table qrforge.ticket_messages drop constraint if exists ticket_messages_kind_check;
alter table qrforge.ticket_messages
  add constraint ticket_messages_kind_check check (kind in ('internal_note','reply_draft','customer','reply_sent'));

alter table qrforge.ticket_messages
  add column if not exists to_email text,
  add column if not exists delivery text check (delivery in ('queued','sent','failed')),
  add column if not exists provider_id text,
  add column if not exists delivery_error text,
  add column if not exists attempts integer not null default 0,
  add column if not exists sent_by uuid references auth.users(id) on delete set null,
  add column if not exists sent_at timestamptz;

-- Rollback (manual):
--   alter table qrforge.ticket_messages drop column to_email, drop column delivery, drop column provider_id, drop column delivery_error, drop column attempts, drop column sent_by, drop column sent_at;
--   (first update rows with kind 'reply_sent' to 'reply_draft', then restore the original kind check)

-- Owner-confirmed support address (shown in the site footer). Existing value, if any, is kept.
insert into qrforge.app_settings (key, value) values ('support_email', 'qrenuvi@bitzpark.com') on conflict (key) do nothing;
