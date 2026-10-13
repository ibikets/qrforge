-- QRForge: dedicated schema, so it stays isolated from other apps in the same Supabase project.
-- Run this once in the Supabase SQL editor.

create schema if not exists qrforge;

-- 1. Subscriptions: one row per user, written only by the server (service role)
create table if not exists qrforge.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null check (plan in ('pro','business')),
  current_period_end timestamptz not null,
  paystack_reference text,
  -- auto-renewal: reusable card authorisation from Paystack (server-only, never exposed to clients)
  authorization_code text,
  customer_email text,
  auto_renew boolean not null default true,
  failed_attempts integer not null default 0,
  last_attempt_at timestamptz,
  updated_at timestamptz not null default now()
);
-- safe to re-run on an existing install
alter table qrforge.subscriptions add column if not exists authorization_code text;
alter table qrforge.subscriptions add column if not exists customer_email text;
alter table qrforge.subscriptions add column if not exists auto_renew boolean not null default true;
alter table qrforge.subscriptions add column if not exists failed_attempts integer not null default 0;
alter table qrforge.subscriptions add column if not exists last_attempt_at timestamptz;

-- 2. Payments: audit trail, reference is unique so webhooks are idempotent
create table if not exists qrforge.payments (
  reference text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null,
  amount_kobo integer not null,
  status text not null,
  created_at timestamptz not null default now()
);

-- 3. Saved QR codes: persisted per user, editable and re-downloadable later
create table if not exists qrforge.qr_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  type text not null,
  fields jsonb not null default '{}'::jsonb,
  style jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists qr_codes_user_idx on qrforge.qr_codes (user_id, created_at desc);

-- Row level security
alter table qrforge.subscriptions enable row level security;
alter table qrforge.payments enable row level security;
alter table qrforge.qr_codes enable row level security;

drop policy if exists "own subscription" on qrforge.subscriptions;
create policy "own subscription" on qrforge.subscriptions for select using (auth.uid() = user_id);

drop policy if exists "own payments" on qrforge.payments;
create policy "own payments" on qrforge.payments for select using (auth.uid() = user_id);

drop policy if exists "own codes select" on qrforge.qr_codes;
create policy "own codes select" on qrforge.qr_codes for select using (auth.uid() = user_id);
drop policy if exists "own codes insert" on qrforge.qr_codes;
create policy "own codes insert" on qrforge.qr_codes for insert with check (auth.uid() = user_id);
drop policy if exists "own codes update" on qrforge.qr_codes;
create policy "own codes update" on qrforge.qr_codes for update using (auth.uid() = user_id);
drop policy if exists "own codes delete" on qrforge.qr_codes;
create policy "own codes delete" on qrforge.qr_codes for delete using (auth.uid() = user_id);

-- Grants for the API roles (a custom schema has none by default)
grant usage on schema qrforge to anon, authenticated, service_role;
-- column-level grants: users can never read authorization_code / customer_email
revoke all on qrforge.subscriptions, qrforge.payments from anon, authenticated;
grant select (user_id, plan, current_period_end, auto_renew, updated_at) on qrforge.subscriptions to authenticated;
grant select (reference, plan, amount_kobo, status, created_at) on qrforge.payments to authenticated;
grant select, insert, update, delete on qrforge.qr_codes to authenticated;
grant all on all tables in schema qrforge to service_role;
alter default privileges in schema qrforge grant all on tables to service_role;

-- AFTER running this: Supabase Dashboard > Project Settings > API > "Exposed schemas"
-- add `qrforge`, otherwise the API will reject requests to it.
