begin;

alter table qrforge.plan_limits add column if not exists max_links integer not null default 0 check (max_links >= 0);
update qrforge.plan_limits set max_links = 0 where plan = 'free';
update qrforge.plan_limits set max_links = 25 where plan = 'pro';
update qrforge.plan_limits set max_links = 250 where plan = 'business';

create table if not exists qrforge.links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z2-9]{8}$'),
  destination text not null check (char_length(destination) between 8 and 2000 and destination ~* '^https?://'),
  rules jsonb not null default '{}'::jsonb check (jsonb_typeof(rules) = 'object' and octet_length(rules::text) <= 12000),
  state text not null default 'active' check (state in ('active','paused')),
  version integer not null default 1,
  taken_down_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists links_user_idx on qrforge.links (user_id, updated_at desc);

create table if not exists qrforge.link_daily (
  link_id uuid not null references qrforge.links(id) on delete cascade,
  day date not null,
  device text not null check (device in ('ios','android','other')),
  target text not null check (target in ('default','device','schedule','paused')),
  bot boolean not null default false,
  opens integer not null default 0 check (opens >= 0),
  primary key (link_id, day, device, target, bot)
);

alter table qrforge.links enable row level security;
alter table qrforge.link_daily enable row level security;
revoke all on qrforge.links, qrforge.link_daily from anon, authenticated;
grant select, insert, update, delete on qrforge.links, qrforge.link_daily to service_role;

create or replace function qrforge.enforce_link_quota() returns trigger
language plpgsql security definer set search_path = pg_catalog, qrforge as $$
declare v_lim qrforge.plan_limits%rowtype; v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('qrforge.links:' || NEW.user_id::text, 0));
  select * into v_lim from qrforge.plan_limits where plan = qrforge.active_plan(NEW.user_id);
  select count(*) into v_count from qrforge.links where user_id = NEW.user_id and deleted_at is null;
  if v_count >= v_lim.max_links then
    raise exception 'dynamic link limit reached for plan %', qrforge.active_plan(NEW.user_id) using errcode = 'QF020', hint = 'limit=' || v_lim.max_links;
  end if;
  return NEW;
end $$;
revoke all on function qrforge.enforce_link_quota() from public, anon, authenticated;
drop trigger if exists links_quota on qrforge.links;
create trigger links_quota before insert on qrforge.links for each row execute function qrforge.enforce_link_quota();

create or replace function qrforge.record_link_open(p_link uuid, p_device text, p_target text, p_bot boolean) returns void
language sql security definer set search_path = pg_catalog, qrforge as $$
  insert into qrforge.link_daily (link_id, day, device, target, bot, opens)
  values (p_link, (now() at time zone 'utc')::date, p_device, p_target, p_bot, 1)
  on conflict (link_id, day, device, target, bot) do update set opens = qrforge.link_daily.opens + 1
$$;
revoke all on function qrforge.record_link_open(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function qrforge.record_link_open(uuid, text, text, boolean) to service_role;

commit;
