begin;

alter table qrforge.plan_limits add column if not exists max_import_rows integer not null default 0 check (max_import_rows >= 0);
update qrforge.plan_limits set max_import_rows = 0 where plan = 'free';
update qrforge.plan_limits set max_import_rows = 500 where plan = 'pro';
update qrforge.plan_limits set max_import_rows = 2000 where plan = 'business';

create table if not exists qrforge.import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  page_id uuid not null references qrforge.pages(id) on delete cascade,
  idem_key text not null check (char_length(idem_key) between 8 and 64),
  source_name text not null default '' check (char_length(source_name) <= 200),
  mode text not null check (mode in ('add','update','both')),
  counts jsonb not null default '{}'::jsonb check (jsonb_typeof(counts) = 'object'),
  before_draft jsonb,
  before_version integer,
  after_version integer,
  status text not null default 'done' check (status in ('done','undone')),
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  unique (user_id, idem_key)
);
create index if not exists import_jobs_page_idx on qrforge.import_jobs (page_id, created_at desc);

alter table qrforge.import_jobs enable row level security;
revoke all on qrforge.import_jobs from anon, authenticated;
grant select, insert, update, delete on qrforge.import_jobs to service_role;

commit;
